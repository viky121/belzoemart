import { Module } from '@nestjs/common';
import { StorageModule } from '../../integrations/storage/storage.module';
import { ShippingModule } from '../../integrations/shipping/shipping.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CartCheckoutModule } from '../checkout/cart-checkout.module';
import { EngagementModule } from '../engagement/engagement.module';
import { AdminModule } from '../admin/admin.module';
import { OrderService } from './order.service';
import { InvoiceService } from './invoice.service';
import { FulfilmentService } from './fulfilment.service';
import { ReturnService } from './return.service';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';

/**
 * Orders/fulfilment domain module (U5). Depends on CatalogueModule
 * (InventoryService), CartCheckoutModule (PaymentService, CartService), and the
 * Storage + Shipping ports. Exports fulfilment/invoice for the worker module.
 */
@Module({
  imports: [StorageModule, ShippingModule, CatalogueModule, CartCheckoutModule, EngagementModule, AdminModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrderService, InvoiceService, FulfilmentService, ReturnService],
  exports: [InvoiceService, FulfilmentService, OrderService],
})
export class OrdersModule {}
