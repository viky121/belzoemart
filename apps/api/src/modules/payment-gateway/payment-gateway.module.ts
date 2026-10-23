import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { CartCheckoutModule } from '../checkout/cart-checkout.module';
import { AdminPaymentGatewayController, PaymentGatewayController } from './payment-gateway.controller';
import { GatewaySettingsService } from './gateway-settings.service';
import { PaymentGatewayService } from './payment-gateway.service';

/**
 * Payment gateway module. Sits in front of the checkout domain's PaymentService
 * (exported by CartCheckoutModule) and the global PAYMENT_PROVIDER port
 * (Razorpay when PAYMENT_PROVIDER=live). It owns the customer-facing confirmation
 * endpoints (verify / sync / pay again), the hosted checkout page the mobile app
 * opens in the browser, the admin view and editor for the Razorpay credentials,
 * and the sweep that cancels abandoned online orders.
 */
@Module({
  imports: [CartCheckoutModule, AdminModule],
  controllers: [PaymentGatewayController, AdminPaymentGatewayController],
  providers: [PaymentGatewayService, GatewaySettingsService],
  exports: [PaymentGatewayService, GatewaySettingsService],
})
export class PaymentGatewayModule {}
