import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

/**
 * Standalone BullMQ worker process. Runs the same domain modules as the API but
 * without the HTTP server, processing async jobs (payment webhooks handling,
 * invoice generation, notifications, shipment sync, abandoned-cart) decoupled
 * from request handling (RESILIENCY-10, NFR-3.4).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const logger = app.get(Logger);
  logger.log('Belzo eMart worker started', 'Worker');
}

void bootstrap();
