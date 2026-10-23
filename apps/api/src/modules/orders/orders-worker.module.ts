import { Module } from '@nestjs/common';
import { StorageModule } from '../../integrations/storage/storage.module';
import { ShippingModule } from '../../integrations/shipping/shipping.module';
import { AdminModule } from '../admin/admin.module';
import { InvoiceService } from './invoice.service';
import { InvoiceMailService } from './invoice-mail.service';
import { FulfilmentService } from './fulfilment.service';
import { OrdersWorker } from './orders.worker';

/**
 * Worker-side orders module (U5). Registers the invoice + shipment processors
 * that run in the standalone worker on `order.confirmed`.
 */
@Module({
  imports: [StorageModule, ShippingModule, AdminModule],
  providers: [InvoiceService, InvoiceMailService, FulfilmentService, OrdersWorker],
})
export class OrdersWorkerModule {}
