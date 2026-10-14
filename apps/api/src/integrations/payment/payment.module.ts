import { Global, Module } from '@nestjs/common';
import { HttpModule } from '../../common/http/http.module';
import { PAYMENT_PROVIDER } from './payment.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { RazorpayPaymentProvider } from './razorpay-payment.provider';

/**
 * Binds the payment port to an adapter based on PAYMENT_PROVIDER (mock | live).
 * "live" selects Razorpay; anything else uses the mock (safe default).
 */
@Global()
@Module({
  imports: [HttpModule],
  providers: [
    MockPaymentProvider,
    RazorpayPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [MockPaymentProvider, RazorpayPaymentProvider],
      useFactory: (mock: MockPaymentProvider, razorpay: RazorpayPaymentProvider) =>
        process.env.PAYMENT_PROVIDER === 'live' ? razorpay : mock,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
