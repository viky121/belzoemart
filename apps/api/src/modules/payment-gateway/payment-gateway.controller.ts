import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { createZodDto } from '../identity/zod-dto';
import { PaymentService } from '../checkout/payment.service';
import { GatewaySettingsService } from './gateway-settings.service';
import { PaymentGatewayService } from './payment-gateway.service';

const verifySchema = z.object({
  orderId: z.string().uuid(),
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});
class VerifyPaymentDto extends createZodDto(verifySchema) {}

const hostedLinkSchema = z.object({ returnUrl: z.string().min(1).max(300) });
class HostedLinkDto extends createZodDto(hostedLinkSchema) {}

function page(res: Response, status: number, message: string): void {
  res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Belzo eMart</title>` +
        `<body style="font-family:system-ui;padding:32px;text-align:center"><p>${message}</p></body>`,
    );
}

/**
 * Customer-facing payment endpoints (verify / sync / pay again) and the hosted
 * checkout used by the mobile app. Everything that changes an order's payment
 * state goes through PaymentService, which asks the gateway rather than trusting
 * the caller.
 */
@ApiTags('payment-gateway')
@Controller('payments')
export class PaymentGatewayController {
  constructor(
    private readonly gateway: PaymentGatewayService,
    private readonly payments: PaymentService,
  ) {}

  /** Web: the checkout widget reported a payment; verify its signature and confirm. */
  @ApiBearerAuth()
  @Post('verify')
  @HttpCode(200)
  verify(@CurrentUser() user: JwtPrincipal, @Body() dto: VerifyPaymentDto) {
    return this.payments.verifyClientPayment(user.sub, dto.orderId, {
      razorpayOrderId: dto.razorpay_order_id,
      razorpayPaymentId: dto.razorpay_payment_id,
      razorpaySignature: dto.razorpay_signature,
    });
  }

  /** Web + mobile: ask the gateway where this order's payment stands. */
  @ApiBearerAuth()
  @Post(':orderId/sync')
  @HttpCode(200)
  sync(@CurrentUser() user: JwtPrincipal, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.payments.syncOrder(user.sub, orderId);
  }

  /** Web: config to open the checkout again for an order that is still unpaid. */
  @ApiBearerAuth()
  @Post(':orderId/config')
  @HttpCode(200)
  config(@CurrentUser() user: JwtPrincipal, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.payments.paymentConfigForOrder(user.sub, orderId);
  }

  /** Mobile: a link that opens the Razorpay checkout for this order in the phone's browser. */
  @ApiBearerAuth()
  @Post(':orderId/hosted-link')
  @HttpCode(200)
  hostedLink(
    @CurrentUser() user: JwtPrincipal,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: HostedLinkDto,
  ) {
    return this.gateway.createHostedLink(user.sub, orderId, dto.returnUrl);
  }

  // ───────────── hosted checkout pages (opened in the phone's browser; the token is the credential) ─────────────

  @Public()
  @ApiExcludeEndpoint()
  @Get('hosted/cancel')
  cancel(@Query('t') token: string | undefined, @Res() res: Response): void {
    try {
      res.redirect(303, this.gateway.hostedCancel(token ?? ''));
    } catch {
      page(res, 403, 'This payment link has expired. Go back to the app and try again.');
    }
  }

  @Public()
  @ApiExcludeEndpoint()
  @Post('hosted/callback')
  async callback(
    @Query('t') token: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    try {
      res.redirect(303, await this.gateway.hostedCallback(token ?? '', body ?? {}));
    } catch (e) {
      if (e instanceof ForbiddenException) {
        page(res, 403, 'This payment link has expired. Go back to the app to see your order.');
        return;
      }
      throw e;
    }
  }

  @Public()
  @ApiExcludeEndpoint()
  @Get('hosted/:token')
  async hosted(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const nonce = randomBytes(16).toString('base64');
    try {
      const html = await this.gateway.hostedPage(token, nonce);
      // The default API CSP (default-src 'self') would block Razorpay's checkout script and
      // frames, so this one page gets its own policy. It serves only our escaped markup and
      // a nonce'd inline script, and the URL (which holds the credential) is never leaked.
      res
        .status(200)
        .set({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy':
            `default-src 'self' https://*.razorpay.com; ` +
            `script-src 'nonce-${nonce}' https://*.razorpay.com; ` +
            `style-src 'unsafe-inline' https://*.razorpay.com; ` +
            `img-src https: data:; ` +
            `connect-src https://*.razorpay.com; ` +
            `frame-src https://*.razorpay.com; ` +
            `form-action 'self' https://*.razorpay.com; base-uri 'none'`,
        })
        .send(html);
    } catch (e) {
      if (e instanceof BadRequestException && e.message === 'already_paid') {
        const back = this.gateway.fallbackReturn(token, 'success');
        if (back) {
          res.redirect(303, back);
          return;
        }
      }
      if (e instanceof ForbiddenException || e instanceof BadRequestException) {
        page(res, e instanceof ForbiddenException ? 403 : 400, 'This payment link cannot be used. Go back to the app and try again.');
        return;
      }
      throw e;
    }
  }
}

/** Admin: is the live gateway configured, and is Razorpay's webhook reaching us? */
const credentialsSchema = z
  .object({
    keyId: z.string().trim().max(100).optional(),
    keySecret: z.string().trim().max(200).optional(),
    webhookSecret: z.string().trim().max(200).optional(),
  })
  .strict();
class CredentialsDto extends createZodDto(credentialsSchema) {}

@ApiTags('payment-gateway')
@ApiBearerAuth()
@Controller('admin/payment-gateway')
export class AdminPaymentGatewayController {
  constructor(
    private readonly gateway: PaymentGatewayService,
    private readonly settings: GatewaySettingsService,
  ) {}

  @Roles('super_admin')
  @Get('status')
  status() {
    return this.gateway.status();
  }

  /**
   * Save new credentials. Secrets are encrypted at rest and never returned; a new key
   * pair is verified with Razorpay first. Omitted fields keep their current value.
   */
  @Roles('super_admin')
  @Put('credentials')
  async save(@CurrentUser() user: JwtPrincipal, @Body() dto: CredentialsDto) {
    await this.settings.save(user.sub, dto);
    return this.gateway.status();
  }

  /** Forget the admin-entered credentials and use the server environment's. */
  @Roles('super_admin')
  @Delete('credentials')
  async reset(@CurrentUser() user: JwtPrincipal) {
    await this.settings.reset(user.sub);
    return this.gateway.status();
  }

  /** Check the keys currently in use with Razorpay (read-only). */
  @Roles('super_admin')
  @Post('test')
  @HttpCode(200)
  test() {
    return this.settings.testCurrent();
  }
}
