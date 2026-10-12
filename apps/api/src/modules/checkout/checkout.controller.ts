import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { checkoutPreviewSchema, placeOrderSchema } from '@belzo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { createZodDto } from '../identity/zod-dto';
import { CheckoutService } from './checkout.service';
import { PaymentService } from './payment.service';

class CheckoutPreviewDto extends createZodDto(checkoutPreviewSchema) {}
class PlaceOrderDto extends createZodDto(placeOrderSchema) {}

/**
 * Checkout endpoints (FR-4.4-4.9). Authenticated (customer). Placing an order
 * requires an Idempotency-Key so retries don't create duplicate orders (BR-11).
 */
@ApiTags('checkout')
@ApiBearerAuth()
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentService,
  ) {}

  @Post('preview')
  preview(@CurrentUser() user: JwtPrincipal, @Body() dto: CheckoutPreviewDto) {
    // Optional paymentMethod: 'cod' includes the COD fee in the preview. The web
    // sends none, so isCod stays false exactly as before.
    return this.checkout.preview(
      { customerId: user.sub },
      dto.addressId,
      dto.couponCode,
      dto.paymentMethod === 'cod',
    );
  }

  @Post('place')
  async place(
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: PlaceOrderDto,
    @Query('idempotencyKey') idempotencyKey: string,
  ) {
    const key = idempotencyKey || `${user.sub}:${dto.addressId}:${Date.now()}`;
    const result = await this.checkout.place({ customerId: user.sub }, dto, key);
    // Initiate gateway payment for non-COD orders.
    let clientConfig: Record<string, unknown> | undefined;
    if (dto.paymentMethod !== 'cod') {
      const init = await this.payments.initiate(result.orderId);
      clientConfig = init.clientConfig;
    }
    return { ...result, payment: { ...result.payment, clientConfig } };
  }
}
