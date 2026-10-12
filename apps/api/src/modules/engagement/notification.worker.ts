import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { QueueService } from '../../common/queue/queue.service';
import { NotificationService } from './notification.service';

interface OrderJob {
  orderId: string;
}

/**
 * NotificationDispatcher (BR-8). Consumes the NOTIFICATIONS queue for order and
 * abandoned-cart events (enqueued by U4/U5/U6), resolves the customer's contact + locale,
 * and dispatches via NotificationService. Runs in the worker process.
 */
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NotificationWorker');
  private worker?: Worker;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      QUEUES.NOTIFICATIONS,
      async (job) => {
        // DPDP jobs live on their own queue now. Forward any legacy ones still
        // sitting here (enqueued before the split) instead of dropping them.
        if (job.name.startsWith('dpdp.')) {
          await this.queue.enqueue(QUEUES.DPDP, job.name, job.data);
          this.logger.log({ jobId: job.id }, 'Forwarded legacy DPDP job to the dpdp queue');
          return;
        }

        // Abandoned-cart carries a customerId (no order).
        if (job.name === 'abandoned_cart') {
          const { customerId } = job.data as { customerId: string };
          if (!customerId) return;
          const cust = await this.prisma.customer.findUnique({ where: { id: customerId } });
          await this.notifications.send({
            customerId,
            type: 'abandoned_cart',
            locale: cust?.locale ?? 'en',
            contact: { email: cust?.email ?? undefined, phone: cust?.phone ?? undefined },
          });
          return;
        }

        const { orderId } = job.data as OrderJob;
        if (!orderId) return;
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) return;
        const customer = await this.prisma.customer.findUnique({ where: { id: order.customerId } });

        await this.notifications.send({
          customerId: order.customerId,
          type: this.mapType(job.name),
          data: { orderId },
          locale: customer?.locale ?? 'en',
          contact: { email: customer?.email ?? undefined, phone: customer?.phone ?? undefined },
        });
      },
      { connection: this.redis.client },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error({ jobId: job?.id, err }, 'Notification job failed'),
    );
  }

  private mapType(jobName: string): 'order.confirmed' | 'order.payment_failed' | 'order.shipped' | 'order.delivered' | 'generic' {
    switch (jobName) {
      case 'order.confirmed':
        return 'order.confirmed';
      case 'order.payment_failed':
        return 'order.payment_failed';
      case 'order.shipped':
        return 'order.shipped';
      case 'order.delivered':
        return 'order.delivered';
      default:
        return 'generic';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
