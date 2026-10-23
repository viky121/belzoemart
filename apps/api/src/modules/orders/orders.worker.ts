import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../common/redis/redis.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { InvoiceMailService } from './invoice-mail.service';
import { FulfilmentService } from './fulfilment.service';

interface OrderJob {
  orderId: string;
}

/**
 * BullMQ consumers for order fulfilment. On `order.confirmed` (enqueued by U4
 * payment capture): generate the GST invoice (INVOICES queue) and create the
 * shipment (SHIPMENTS queue). Retries/backoff are configured on the producer
 * side (RESILIENCY-10).
 */
@Injectable()
export class OrdersWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OrdersWorker');
  private workers: Worker[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly invoiceMail: InvoiceMailService,
    private readonly fulfilment: FulfilmentService,
  ) {}

  onModuleInit(): void {
    this.workers.push(
      new Worker(
        QUEUES.INVOICES,
        async (job) => {
          if (job.name === 'order.confirmed') {
            await this.invoiceMail.generateAndEmail((job.data as OrderJob).orderId);
          }
        },
        { connection: this.redis.client },
      ),
    );

    this.workers.push(
      new Worker(
        QUEUES.SHIPMENTS,
        async (job) => {
          if (job.name === 'order.confirmed') {
            const { orderId } = job.data as OrderJob;
            const { shipmentId } = await this.fulfilment.createShipment(orderId);
            await this.fulfilment.syncTracking(shipmentId);
          }
        },
        { connection: this.redis.client },
      ),
    );

    for (const w of this.workers) {
      w.on('failed', (job, err) => this.logger.error({ jobId: job?.id, err }, 'Order job failed'));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
