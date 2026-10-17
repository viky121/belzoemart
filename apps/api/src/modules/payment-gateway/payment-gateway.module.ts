import { Module } from '@nestjs/common';
import { CartCheckoutModule } from '../checkout/cart-checkout.module';
import { AdminPaymentGatewayController, PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';

/**
 * Payment gateway module. Sits in front of the checkout domain's PaymentService
 * (exported by CartCheckoutModule) and the global PAYMENT_PROVIDER port
 * (Razorpay when PAYMENT_PROVIDER=live). It owns the customer-facing confirmation
 * endpoints (verify / sync / pay again), the hosted checkout page the mobile app
 * opens in the browser, the admin status view, and the sweep that cancels
 * abandoned online orders.
 */
@Module({
  imports: [CartCheckoutModule],
  controllers: [PaymentGatewayController, AdminPaymentGatewayController],
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
