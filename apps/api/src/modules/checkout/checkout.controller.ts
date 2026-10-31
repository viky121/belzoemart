import { Body, Controller, Logger, Post, Query } from '@nestjs/common';
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
  private readonly logger = new Logger('CheckoutController');

  constructor(
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentService,
  ) {}

  @Post('preview')
  async preview(@CurrentUser() user: JwtPrincipal, @Body() dto: CheckoutPreviewDto) {
    // Optional paymentMethod: 'cod' includes the COD fee in the preview. The web
    // sends none, so isCod stays false exactly as before.
    const result = await this.checkout.preview(
      { customerId: user.sub },
      dto.addressId,
      dto.couponCode,
      dto.paymentMethod === 'cod',
    );
    // Lets the apps offer "pay online" only when a real gateway is configured.
    return { ...result, onlinePayment: this.payments.onlinePaymentEnabled };
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
    // Cash on Delivery has no payment to wait for: confirm it now (also on a replayed key, in case the first try
    // failed). If this fails the order stays pending and the admin can confirm it from the orders page.
    if (dto.paymentMethod === 'cod') {
      try {
        await this.payments.confirmCodOrder(result.orderId);
      } catch (e) {
        this.logger.error(`Could not confirm Cash on Delivery order ${result.orderId}: ${String(e)}`);
      }
    }
    return { ...result, payment: { ...result.payment, clientConfig } };
  }
}
