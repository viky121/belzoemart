import { Module } from '@nestjs/common';
import { AuthModule } from '../../common/auth/auth.module';
import { DeliveryModule } from './delivery.module';
import { DeliveryWorker } from './worker/delivery.worker';

/**
 * Worker-side delivery module (U8). Registers the consumer for the `delivery` queue and its repeatable
 * jobs. It is imported only by the worker application, so these jobs never run inside the API process.
 * AuthModule provides the JWT service the identity services need.
 */
@Module({
  imports: [AuthModule, DeliveryModule],
  providers: [DeliveryWorker],
})
export class DeliveryWorkerModule {}
