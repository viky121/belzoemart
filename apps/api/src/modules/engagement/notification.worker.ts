import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { QueueService } from '../../common/queue/queue.service';
import {
  orderConfirmedEmail,
  orderDeliveredEmail,
  orderShippedEmail,
  welcomeEmail,
  type RenderedEmail,
} from '../../integrations/notifications/email-templates';
import { NotificationService } from './notification.service';

interface OrderJob {
  orderId: string;
}

type OrderEventType = 'order.confirmed' | 'order.payment_failed' | 'order.shipped' | 'order.delivered' | 'generic';

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

        // Welcome email after sign-up (email only; the customer just verified their number).
        if (job.name === 'customer.welcome') {
          const { customerId } = job.data as { customerId: string };
          if (!customerId) return;
          const cust = await this.prisma.customer.findUnique({ where: { id: customerId } });
          if (!cust?.email) return;
          await this.notifications.send({
            customerId,
            type: 'customer.welcome',
            locale: cust.locale ?? 'en',
            contact: { email: cust.email },
            email: welcomeEmail({ name: cust.name }),
            emailOnly: true,
          });
          return;
        }

        const { orderId } = job.data as OrderJob;
        if (!orderId) return;
        const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!order) return;
        const customer = await this.prisma.customer.findUnique({ where: { id: order.customerId } });
        const type = this.mapType(job.name);

        await this.notifications.send({
          customerId: order.customerId,
          type,
          data: { orderId },
          locale: customer?.locale ?? 'en',
          contact: { email: customer?.email ?? undefined, phone: customer?.phone ?? undefined },
          email: customer?.email ? await this.buildOrderEmail(type, order, customer.name) : undefined,
        });
      },
      { connection: this.redis.client },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error({ jobId: job?.id, err }, 'Notification job failed'),
    );
  }

  /**
   * Rich HTML email for order events. Returns undefined (so the plain title/body email is used instead)
   * for events without a template or when the extra data cannot be loaded: a notification must never fail
   * just because a nicer layout could not be built.
   */
  private async buildOrderEmail(
    type: OrderEventType,
    order: {
      id: string;
      addressId: string;
      subtotal: number;
      discount: number;
      shipping: number;
      codFee: number;
      grandTotal: number;
      items: { title: string; quantity: number; unitPrice: number }[];
    },
    customerName: string | null,
  ): Promise<RenderedEmail | undefined> {
    try {
      if (type === 'order.confirmed') {
        const address = await this.prisma.address.findUnique({ where: { id: order.addressId } });
        return orderConfirmedEmail({ name: customerName, order, address });
      }
      if (type === 'order.shipped') {
        const shipment = await this.prisma.shipment.findFirst({
          where: { orderId: order.id },
          orderBy: { createdAt: 'desc' },
        });
        return orderShippedEmail({
          name: customerName,
          orderId: order.id,
          courier: shipment?.courier,
          awb: shipment?.awb,
          trackingUrl: shipment?.trackingUrl,
          estimatedDelivery: shipment?.estimatedDelivery,
        });
      }
      if (type === 'order.delivered') {
        return orderDeliveredEmail({ name: customerName, orderId: order.id });
      }
    } catch (err) {
      this.logger.warn({ err, orderId: order.id }, 'Could not build the rich order email, sending the plain one');
    }
    return undefined;
  }

  private mapType(jobName: string): OrderEventType {
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
