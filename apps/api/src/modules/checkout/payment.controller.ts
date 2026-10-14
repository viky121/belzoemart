import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { PaymentService } from './payment.service';

/**
 * Payment webhook receiver (BR-13). Public (called by the gateway) but the
 * signature is verified inside the service — the ONLY trusted path to mark a
 * payment captured. Requires the raw request body for signature verification
 * (configured in main.ts).
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') razorpaySig?: string,
    @Headers('x-webhook-signature') genericSig?: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = razorpaySig ?? genericSig ?? '';
    return this.payments.handleWebhook(rawBody, signature);
  }
}
