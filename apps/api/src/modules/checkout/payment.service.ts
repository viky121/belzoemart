import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { QUEUES } from '../../common/queue/queue.constants';
import { InventoryService } from '../catalogue/inventory.service';
import { CartService } from '../cart/cart.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../integrations/payment/payment.provider';
import { createHash } from 'node:crypto';

/** What the customer's app/browser can show after asking about a payment. */
export type PaymentProgress = 'paid' | 'processing' | 'cancelled';

export interface ClientPaymentProof {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

interface PaymentRef {
  id: string;
  orderId: string;
  amount: number;
  providerOrderId: string | null;
}

/**
 * Payment orchestration (BR-12, BR-13). Creates the gateway order for the
 * pending payment and confirms it. A payment is only ever marked captured from
 * a path the gateway vouches for: a signature-verified webhook, a verified
 * checkout signature, or the gateway's own order listing (never a bare client
 * claim, SECURITY-08). Every path funnels into {@link markCaptured}, which is
 * atomic, so the webhook, the browser callback and the poller can race freely.
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

  /** True when real money can be taken (live gateway selected). */
  get onlinePaymentEnabled(): boolean {
    return this.provider.kind === 'razorpay';
  }

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
   * for U5/U6.
   *
   * A failed attempt does NOT cancel the order: the customer can retry inside
   * the same checkout (a later success arrives for the same gateway order), and
   * an order that is never paid is cancelled by {@link expireAbandoned}.
   */
  async handleWebhook(rawBody: Buffer, signature: string, eventIdHeader?: string): Promise<{ status: string }> {
    const verification = this.provider.verifyWebhook(rawBody, signature, eventIdHeader);
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

    const event = verification.event;
    if (event.includes('captured') || event.includes('paid')) {
      if (verification.amount !== undefined && verification.amount !== payment.amount) {
        // Never confirm an order for the wrong amount; leave it for a human.
        this.logger.error(
          `Webhook ${verification.eventId}: amount mismatch for order ${payment.orderId} ` +
            `(gateway ${verification.amount}, expected ${payment.amount}) — not confirmed`,
        );
        await this.markEventProcessed(verification.eventId);
        return { status: 'amount_mismatch' };
      }
      await this.markCaptured(payment, verification.providerPaymentId, verification.method);
    } else if (event.includes('authorized')) {
      // Money is held but not ours until captured (account not on auto-capture).
      await this.reconcile(payment);
    } else if (event.includes('failed')) {
      this.logger.log(`Payment attempt failed for order ${payment.orderId}; order stays open for a retry`);
    }

    await this.markEventProcessed(verification.eventId);
    return { status: 'processed' };
  }

  private async markEventProcessed(eventId: string): Promise<void> {
    await this.prisma.webhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } });
  }

  // ───────────────────────── customer-facing confirmation paths ─────────────────────────

  /**
   * The checkout widget reported a payment. Verify its signature (proves it was made
   * for this gateway order), then ask the gateway for the authoritative status. This is
   * what makes confirmation work even before/without the webhook being configured.
   */
  async verifyClientPayment(
    customerId: string,
    orderId: string,
    proof: ClientPaymentProof,
  ): Promise<{ status: PaymentProgress }> {
    const payment = await this.ownedPayment(customerId, orderId);
    if (!payment.providerOrderId || payment.providerOrderId !== proof.razorpayOrderId) {
      throw new BadRequestException('This payment does not belong to the order');
    }
    if (!this.provider.verifyCheckoutSignature(proof.razorpayOrderId, proof.razorpayPaymentId, proof.razorpaySignature)) {
      throw new BadRequestException('Invalid payment signature');
    }
    await this.tryReconcile(payment);
    return { status: await this.progressOf(orderId) };
  }

  /** Ask the gateway where this order's payment stands and confirm it if it was paid. */
  async syncOrder(customerId: string, orderId: string): Promise<{ status: PaymentProgress }> {
    const payment = await this.ownedPayment(customerId, orderId);
    if ((await this.progressOf(orderId)) === 'processing') {
      await this.tryReconcile(payment);
    }
    return { status: await this.progressOf(orderId) };
  }

  /**
   * Config to (re)open the gateway checkout for an order that is still awaiting payment
   * ("Pay again"). Checks the gateway first so a customer who already paid is never
   * asked to pay twice.
   */
  async paymentConfigForOrder(
    customerId: string,
    orderId: string,
  ): Promise<{ provider: string; amount: number; alreadyPaid: boolean; clientConfig: Record<string, unknown> }> {
    const payment = await this.ownedPayment(customerId, orderId);
    const progress = await this.progressOf(orderId);
    if (progress === 'paid') {
      return { provider: this.provider.kind, amount: payment.amount, alreadyPaid: true, clientConfig: {} };
    }
    if (progress === 'cancelled') throw new ConflictException('This order was cancelled. Please place it again.');

    await this.tryReconcile(payment);
    if ((await this.progressOf(orderId)) === 'paid') {
      return { provider: this.provider.kind, amount: payment.amount, alreadyPaid: true, clientConfig: {} };
    }

    if (!payment.providerOrderId) {
      const init = await this.initiate(orderId);
      if (Object.keys(init.clientConfig).length === 0) {
        throw new ConflictException('Payment is being set up. Please try again in a moment.');
      }
      return { provider: init.provider, amount: payment.amount, alreadyPaid: false, clientConfig: init.clientConfig };
    }
    return {
      provider: this.provider.kind,
      amount: payment.amount,
      alreadyPaid: false,
      clientConfig: this.provider.clientConfigFor(payment.providerOrderId, payment.amount),
    };
  }

  /** The caller's own online payment for an order, or 404 (never reveals other customers' orders). */
  private async ownedPayment(customerId: string, orderId: string): Promise<PaymentRef> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order || order.customerId !== customerId) throw new NotFoundException('Order not found');
    const payment = order.payments[0];
    if (!payment || payment.provider === 'cod') throw new BadRequestException('This order has no online payment');
    return { id: payment.id, orderId: order.id, amount: payment.amount, providerOrderId: payment.providerOrderId };
  }

  private async progressOf(orderId: string): Promise<PaymentProgress> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status === 'cancelled') return 'cancelled';
    return order.status === 'pending' ? 'processing' : 'paid';
  }

  /** Reconcile, but a gateway hiccup must not turn into a customer-facing error. */
  private async tryReconcile(payment: PaymentRef): Promise<void> {
    try {
      await this.reconcile(payment);
    } catch (e) {
      this.logger.warn(`Could not reconcile order ${payment.orderId} with the gateway: ${String(e)}`);
    }
  }

  /**
   * Ask the gateway what it holds for this order and confirm the order if the full
   * amount was paid. Captures an authorized payment first when the account isn't on
   * auto-capture (an uncaptured payment is auto-refunded by the gateway after a few days).
   */
  async reconcile(payment: PaymentRef): Promise<'captured' | 'pending'> {
    if (!payment.providerOrderId) return 'pending';
    const attempts = await this.provider.listOrderPayments(payment.providerOrderId);
    let paid = attempts.find((p) => p.status === 'captured' && p.amount === payment.amount);
    if (!paid) {
      const authorized = attempts.find((p) => p.status === 'authorized' && p.amount === payment.amount);
      if (authorized) {
        const captured = await this.provider.capturePayment(authorized.id, payment.amount);
        if (captured.status === 'captured') paid = { ...authorized, status: 'captured', method: captured.method ?? authorized.method };
      }
    }
    if (!paid) return 'pending';
    await this.markCaptured(payment, paid.id, paid.method);
    return 'captured';
  }

  // ───────────────────────── state transitions ─────────────────────────

  private async markCaptured(payment: PaymentRef, providerPaymentId?: string, method?: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: payment.orderId }, include: { items: true } });
    if (!order) return;

    if (order.status === 'cancelled') {
      // Money arrived for an order we already cancelled (expired, or cancelled while the
      // customer was paying). Keep a record and give it straight back.
      await this.refundLateCapture(payment, providerPaymentId, method);
      return;
    }
    if (order.status !== 'pending') return; // already handled

    // Atomic claim: webhook, browser callback and poller can all land here at once;
    // only the one that flips pending → confirmed carries on.
    const won = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: payment.orderId, status: 'pending' },
        data: { status: 'confirmed' },
      });
      if (claim.count === 0) return false;
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'captured', providerPaymentId, method },
      });
      return true;
    });
    if (!won) return;
    await this.afterConfirmed(order, true);
  }

  /**
   * Cash on Delivery has no payment to wait for, so the order is confirmed as soon as it is placed. Only a
   * PENDING order with a Cash on Delivery payment is touched: an online order waits for its payment and a
   * confirmed one is left alone, so calling this twice is safe. Returns true when this call confirmed the order.
   */
  async confirmCodOrder(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
    if (!order || order.status !== 'pending') return false;
    if (!order.payments.some((p) => p.provider === 'cod')) return false;
    const claim = await this.prisma.order.updateMany({ where: { id: orderId, status: 'pending' }, data: { status: 'confirmed' } });
    if (claim.count === 0) return false;
    // The purchased cart lines were already cleared when the order was placed.
    await this.afterConfirmed(order, false);
    return true;
  }

  /**
   * What follows an order turning confirmed (paid, or Cash on Delivery): the reserved stock becomes a sale,
   * then fulfilment, the customer message and the invoice are told. Runs once, by whoever won the claim.
   */
  private async afterConfirmed(
    order: { id: string; customerId: string; items: { variantId: string; quantity: number }[] },
    clearCart: boolean,
  ): Promise<void> {
    // Convert reservations to sales (decrements reserved).
    for (const item of order.items) {
      await this.inventory.confirmSale(item.variantId, item.quantity, order.id);
    }

    if (clearCart) {
      // Paid: clear the purchased lines from the customer's cart.
      // Non-fatal: the payment is already captured.
      try {
        await this.cart.removePurchased(order.customerId, order.items.map((i) => i.variantId));
      } catch (e) {
        this.logger.warn(`Cart clear failed for order ${order.id}: ${String(e)}`);
      }
    }

    // Hand off to U5 fulfilment + U6 notifications (async, decoupled).
    await this.queue.enqueue(QUEUES.SHIPMENTS, 'order.confirmed', { orderId: order.id });
    await this.queue.enqueue(QUEUES.NOTIFICATIONS, 'order.confirmed', { orderId: order.id });
    await this.queue.enqueue(QUEUES.INVOICES, 'order.confirmed', { orderId: order.id });
  }

  private async refundLateCapture(payment: PaymentRef, providerPaymentId?: string, method?: string): Promise<void> {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'captured', providerPaymentId, method },
    });
    try {
      await this.refund(payment.orderId, payment.amount);
      this.logger.warn(`Order ${payment.orderId} was cancelled but paid; the payment was refunded automatically`);
    } catch (e) {
      // Needs a human: money is held for a cancelled order.
      this.logger.error(`REFUND NEEDED: cancelled order ${payment.orderId} was paid and auto-refund failed: ${String(e)}`);
    }
  }

  /** Cancel an unpaid online order and put its stock back on the shelf. */
  private async markFailed(paymentId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== 'pending') return;

    const won = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: orderId, status: 'pending' },
        data: { status: 'cancelled', cancelledReason: 'Payment not completed' },
      });
      if (claim.count === 0) return false;
      await tx.payment.update({ where: { id: paymentId }, data: { status: 'failed' } });
      return true;
    });
    if (!won) return;
    // Release reserved stock back to available.
    for (const item of order.items) {
      await this.inventory.release(item.variantId, item.quantity, order.id);
    }
    await this.queue.enqueue(QUEUES.NOTIFICATIONS, 'order.payment_failed', { orderId });
  }

  /**
   * Cancel online orders whose payment never completed (customer closed the
   * checkout, app was killed, UPI timed out). Before cancelling each one the
   * gateway is asked whether it was actually paid; if the gateway can't be
   * reached the order is left alone, because it might be paid.
   */
  async expireAbandoned(maxAgeMs = 30 * 60 * 1000, limit = 50): Promise<{ checked: number; cancelled: number; confirmed: number }> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const stale = await this.prisma.payment.findMany({
      where: {
        provider: this.provider.kind === 'razorpay' ? 'razorpay' : 'mock',
        status: { in: ['created', 'pending'] },
        createdAt: { lt: cutoff },
        order: { status: 'pending' },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let cancelled = 0;
    let confirmed = 0;
    for (const p of stale) {
      const ref: PaymentRef = { id: p.id, orderId: p.orderId, amount: p.amount, providerOrderId: p.providerOrderId };
      try {
        if (ref.providerOrderId && (await this.reconcile(ref)) === 'captured') {
          confirmed++;
          continue;
        }
      } catch (e) {
        this.logger.warn(`Expiry skipped order ${ref.orderId} (gateway unreachable): ${String(e)}`);
        continue;
      }
      await this.markFailed(p.id, p.orderId);
      cancelled++;
    }
    return { checked: stale.length, cancelled, confirmed };
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
