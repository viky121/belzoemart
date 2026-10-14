import { Module } from '@nestjs/common';
import { PaymentModule } from '../../integrations/payment/payment.module';
import { IdentityModule } from '../identity/identity.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { AdminModule } from '../admin/admin.module';
import { CartService } from '../cart/cart.service';
import { CartController } from '../cart/cart.controller';
import { CouponService } from './coupon.service';
import { PricingService } from './pricing.service';
import { CheckoutService } from './checkout.service';
import { PaymentService } from './payment.service';
import { CheckoutController } from './checkout.controller';
import { CouponController } from './coupon.controller';
import { AdminCouponController } from './admin-coupon.controller';
import { PaymentController } from './payment.controller';

/**
 * Cart + checkout domain module (U4). Depends on CatalogueModule
 * (InventoryService), IdentityModule (TokenService for cart context), and the
 * PaymentModule port. Exports PaymentService for U5 refunds.
 */
@Module({
  imports: [CatalogueModule, IdentityModule, PaymentModule, AdminModule],
  controllers: [CartController, CheckoutController, CouponController, AdminCouponController, PaymentController],
  providers: [CartService, CouponService, PricingService, CheckoutService, PaymentService],
  exports: [PaymentService, CheckoutService, CartService],
})
export class CartCheckoutModule {}
