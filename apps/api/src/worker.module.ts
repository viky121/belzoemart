import { Module } from '@nestjs/common';
import { AppConfigModule } from './common/config/config.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { HttpModule } from './common/http/http.module';
import { QueueModule } from './common/queue/queue.module';
import { IdentityWorkerModule } from './modules/identity/identity-worker.module';
import { OrdersWorkerModule } from './modules/orders/orders-worker.module';
import { EngagementWorkerModule } from './modules/engagement/engagement-worker.module';

/**
 * Worker application context (no HTTP server). Domain units register their
 * BullMQ processors here. U2 adds the DPDP export/deletion processors; U5/U6
 * add invoice, shipment, and notification processors.
 */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    RedisModule,
    HttpModule,
    QueueModule,
    IdentityWorkerModule,
    OrdersWorkerModule,
    EngagementWorkerModule,
  ],
})
export class WorkerModule {}
