import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { InventoryService } from '../catalogue/inventory.service';
import { CartService } from '../cart/cart.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../integrations/payment/payment.provider';
import { createHash } from 'node:crypto';

/**
 * Payment orchestration (BR-12, BR-13). Creates the gateway order for the
 * pending payment, and processes webhooks — the ONLY trusted path for marking a
 * payment captured (never client-side, SECURITY-08). Webhook processing is
 * idempotent by provider eventId.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger('PaymentService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly queue: QueueService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly cart: CartService,
  ) {}

  /**
   * Create the gateway order for an order's pending payment; returns client config.
   * Idempotent: only a payment still in `created` is initiated; any other status
   * (a replayed place, a concurrent second call) returns `clientConfig: {}`.
   */
  async initiate(orderId: string): Promise<{ provider: string; clientConfig: Record<string, unknown> }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    const payment = order.payments[0];
    if (!payment) throw new BadRequestException('No payment for order');
    if (payment.provider === 'cod') {
      return { provider: 'cod', clientConfig: { cod: true } };
    }

    // Atomic claim: only one caller may move created → pending. Every replay,
    // sequential or concurrent, sees count 0 and returns without side effects,
    // so an idempotent replay never creates a second gateway order or touches the row.
    const claim = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'created' },
      data: { status: 'pending' },
    });
    if (claim.count === 0) {
      return { provider: payment.provider, clientConfig: {} };
    }

    let providerOrder: Awaited<ReturnType<PaymentProvider['createOrder']>>;
    try {
      providerOrder = await this.provider.createOrder(payment.amount, order.id);
    } catch (e) {
      // Undo the claim so a later replay can initiate again; rethrow (5xx → client keeps its key).
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: 'pending', providerOrderId: null },
        data: { status: 'created' },
      });
      throw e;
    }
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerOrderId: providerOrder.providerOrderId }, // status is already 'pending'; never overwrite it here
    });

    // The mock provider has no real gateway to deliver a capture webhook, so a
    // non-COD order would hang in "pending" forever (the result page polls for
    // a confirmation that never arrives). Simulate the gateway's captured
    // webhook through the SAME signature-verified path so the demo flow
    // completes. Live providers (Razorpay) deliver this webhook for real.
    if (this.provider.kind === 'mock') {
      const body = Buffer.from(
        JSON.stringify({
          eventId: `mock_evt_${providerOrder.providerOrderId}`,
          event: 'payment.captured',
          providerOrderId: providerOrder.providerOrderId,
          method: 'upi',
        }),
      );
      const signature = createHash('sha256').update(body).digest('hex');
      await this.handleWebhook(body, signature).catch((e) =>
        this.logger.warn(`Mock auto-capture failed for order ${order.id}: ${String(e)}`),
      );
    }

    return { provider: this.provider.kind, clientConfig: providerOrder.clientConfig };
  }

  /**
   * Handle a gateway webhook. Verifies the signature, records the event
   * idempotently (unique eventId), and on capture confirms the order, converts
   * the stock reservation to a sale, and enqueues fulfilment/notification jobs
   * for U5/U6. On failure, releases the reserved stock.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ status: string }> {
    const verification = this.provider.verifyWebhook(rawBody, signature);
    if (!verification.valid) throw new BadRequestException('Invalid webhook signature');

    // Idempotency: if we've already processed this event, do nothing.
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventId: verification.eventId },
    });
    if (existing?.processedAt) return { status: 'already_processed' };

    await this.prisma.webhookEvent.upsert({
      where: { eventId: verification.eventId },
      update: {},
      create: {
        provider: this.provider.kind,
        eventId: verification.eventId,
        payloadJson: JSON.parse(rawBody.toString('utf8')),
      },
    });

    const payment = verification.providerOrderId
      ? await this.prisma.payment.findFirst({ where: { providerOrderId: verification.providerOrderId } })
      : null;
    if (!payment) {
      this.logger.warn(`Webhook ${verification.eventId}: no matching payment`);
      return { status: 'ignored' };
    }

    if (verification.event.includes('captured') || verification.event.includes('paid')) {
      await this.markCaptured(payment.id, payment.orderId, verification.providerPaymentId, verification.method);
    } else if (verification.event.includes('failed')) {
      await this.markFailed(payment.id, payment.orderId);
    }

    await this.prisma.webhookEvent.update({
      where: { eventId: verification.eventId },
      data: { processedAt: new Date() },
    });
    return { status: 'processed' };
  }

  private async markCaptured(
    paymentId: string,
    orderId: string,
    providerPaymentId?: string,
    method?: string,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== 'pending') return; // already handled

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'captured', providerPaymentId, method },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: 'confirmed' } });
    });

    // Convert reservations to sales (decrements reserved).
    for (const item of order.items) {
      await this.inventory.confirmSale(item.variantId, item.quantity, order.id);
    }

    // Paid: clear the purchased lines from the customer's cart. Runs once,
    // because a replayed/late webhook returns above when the order is no
    // longer pending. Non-fatal: the payment is already captured.
    try {
      await this.cart.removePurchased(order.customerId, order.items.map((i) => i.variantId));
    } catch (e) {
      this.logger.warn(`Cart clear failed for order ${order.id}: ${String(e)}`);
    }

    // Hand off to U5 fulfilment + U6 notifications (async, decoupled).
    await this.queue.enqueue(QUEUES.SHIPMENTS, 'order.confirmed', { orderId });
    await this.queue.enqueue(QUEUES.NOTIFICATIONS, 'order.confirmed', { orderId });
    await this.queue.enqueue(QUEUES.INVOICES, 'order.confirmed', { orderId });
  }

  private async markFailed(paymentId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== 'pending') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'failed' } });
      await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
    });
    // Release reserved stock back to available.
    for (const item of order.items) {
      await this.inventory.release(item.variantId, item.quantity, order.id);
    }
    await this.queue.enqueue(QUEUES.NOTIFICATIONS, 'order.payment_failed', { orderId });
  }

  /** Initiate a refund for a captured payment (used by U5 returns). */
  async refund(orderId: string, amountPaise: number): Promise<{ status: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: 'captured' },
    });
    if (!payment?.providerPaymentId) throw new BadRequestException('No captured payment to refund');
    const refund = await this.provider.createRefund(payment.providerPaymentId, amountPaise);
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: amountPaise >= payment.amount ? 'refunded' : 'partially_refunded' },
    });
    return { status: refund.status };
  }
}
