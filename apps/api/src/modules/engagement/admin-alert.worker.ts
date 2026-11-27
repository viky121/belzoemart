import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  ADMIN_ALERTS_SETTING_KEY,
  adminAlertEnabled,
  formatMoney,
  formatPickupSlot,
  paise,
  paymentMethodLabel,
  paymentStatusView,
  pickPayment,
  sanitizeAdminAlerts,
} from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { RedisService } from '../../common/redis/redis.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../../integrations/notifications/channels';
import {
  adminNewOrderEmail,
  adminOrderCancelledEmail,
  adminPaymentFailedEmail,
  type AdminAlertOrder,
  type RenderedEmail,
} from '../../integrations/notifications/email-templates';
import { ADMIN_ALERT_JOB, resolveAdminAlertRecipients, type AdminAlertJob } from './admin-alerts';

/** Once an alert has gone out for an order + event, it is not sent again for this long. */
const SENT_TTL_SECONDS = 60 * 24 * 60 * 60;

/**
 * Sends the shop's order alert emails (new order, payment failed, cancelled) to the addresses saved in
 * Admin → Settings. Runs in the worker. One alert per order and event: a record in Redis is taken before sending and
 * dropped again if the email fails, so BullMQ's retry can send it later.
 */
@Injectable()
export class AdminAlertWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AdminAlertWorker');
  private worker?: Worker;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      QUEUES.ADMIN_ALERTS,
      async (job) => {
        if (job.name !== ADMIN_ALERT_JOB) return;
        await this.handle(job.data as AdminAlertJob);
      },
      { connection: this.redis.client },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error({ jobId: job?.id, err: err?.message }, 'Order alert email failed (will retry)'),
    );
  }

  /** Build and send one alert. Returns what happened (for tests and logs). */
  async handle(job: AdminAlertJob): Promise<'sent' | 'off' | 'no_recipient' | 'already_sent' | 'no_order'> {
    if (!job?.orderId || !job.event) return 'no_order';
    const row = await this.prisma.setting.findUnique({ where: { key: ADMIN_ALERTS_SETTING_KEY } });
    const config = sanitizeAdminAlerts(row?.valueJson);
    if (!adminAlertEnabled(config, job.event)) return 'off';
    const to = resolveAdminAlertRecipients(config);
    if (to.length === 0) {
      this.logger.warn(`No address for order alerts (set one in Admin → Settings); ${job.event} alert for ${job.orderId} not sent`);
      return 'no_recipient';
    }

    const order = await this.prisma.order.findUnique({ where: { id: job.orderId }, include: { items: true, payments: true } });
    if (!order) return 'no_order';

    const key = `admin-alert:sent:${job.event}:${job.orderId}`;
    const claimed = await this.redis.client.set(key, '1', 'EX', SENT_TTL_SECONDS, 'NX');
    if (claimed !== 'OK') return 'already_sent';

    try {
      const mail = await this.build(job, order);
      await this.email.send({ to: to.join(', '), subject: mail.subject, html: mail.html });
      this.logger.log(`Order alert "${job.event}" for ${job.orderId} sent to ${to.length} address(es)`);
      return 'sent';
    } catch (e) {
      await this.redis.client.del(key); // let the retry send it
      throw e;
    }
  }

  private async build(
    job: AdminAlertJob,
    order: NonNullable<Awaited<ReturnType<PrismaService['order']['findUnique']>>> & {
      items: { title: string; quantity: number; unitPrice: number }[];
      payments: { provider: string; status: string; method: string | null; createdAt: Date; amount: number }[];
    },
  ): Promise<RenderedEmail> {
    const [customer, address] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: order.customerId }, select: { name: true, phone: true, email: true } }),
      order.fulfilment === 'pickup' ? Promise.resolve(null) : this.prisma.address.findUnique({ where: { id: order.addressId } }),
    ]);
    const payments = order.payments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }));
    const pay = pickPayment(payments);
    const payView = paymentStatusView({ orderStatus: order.status, fulfilment: order.fulfilment, payment: pay });
    const data: AdminAlertOrder = {
      id: order.id,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({ title: i.title, quantity: i.quantity, unitPrice: i.unitPrice })),
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      codFee: order.codFee,
      grandTotal: order.grandTotal,
      fulfilment: order.fulfilment,
      pickupSlot: formatPickupSlot(order.pickupSlotStart, order.pickupSlotEnd),
      customer: { name: customer?.name ?? null, phone: customer?.phone ?? null, email: customer?.email ?? null },
      address: address
        ? { fullName: address.fullName, phone: address.phone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, pincode: address.pincode }
        : null,
      paymentMethod: paymentMethodLabel(pay, order.fulfilment),
      paymentStatus: payView.label,
    };
    if (job.event === 'new_order') return adminNewOrderEmail(data);
    if (job.event === 'payment_failed') return adminPaymentFailedEmail(data);
    const captured = order.payments.find((p) => p.provider !== 'cod' && (p.status === 'captured' || p.status === 'refunded' || p.status === 'partially_refunded'));
    const refund = captured ? `${formatMoney(paise(captured.amount))} paid online is being refunded to the customer automatically.` : null;
    return adminOrderCancelledEmail(data, { by: job.by, reason: job.reason ?? order.cancelledReason, refund });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
