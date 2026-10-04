import { Global, Module } from '@nestjs/common';
import { HttpModule } from '../../common/http/http.module';
import { AdminModule } from '../../modules/admin/admin.module';
import { SHIPPING_PROVIDER } from './shipping.provider';
import { MockShippingProvider } from './mock-shipping.provider';
import { ShipRocketProvider } from './shiprocket.provider';

/**
 * Binds the shipping port based on SHIPPING_PROVIDER (mock | live). "live"
 * selects ShipRocket; otherwise the deterministic mock (safe default).
 */
@Global()
@Module({
  imports: [HttpModule, AdminModule],
  providers: [
    MockShippingProvider,
    ShipRocketProvider,
    {
      provide: SHIPPING_PROVIDER,
      inject: [MockShippingProvider, ShipRocketProvider],
      useFactory: (mock: MockShippingProvider, shiprocket: ShipRocketProvider) =>
        process.env.SHIPPING_PROVIDER === 'live' ? shiprocket : mock,
    },
  ],
  exports: [SHIPPING_PROVIDER],
})
export class ShippingModule {}
