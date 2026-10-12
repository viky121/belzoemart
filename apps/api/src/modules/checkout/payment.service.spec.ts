import { Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import type {
  PaymentProvider,
  WebhookVerification,
} from '../../integrations/payment/payment.provider';

interface PaymentRow {
  id: string;
  orderId: string;
  provider: string;
  amount: number;
  status: string;
  providerOrderId: string | null;
  providerPaymentId?: string | null;
  method?: string | null;
}
interface OrderRow {
  id: string;
  customerId: string;
  status: string;
  items: { variantId: string; quantity: number }[];
}

/** In-memory fake of the tables PaymentService touches. */
function makeStore(opts: { orderStatus?: string; payment?: Partial<PaymentRow> } = {}) {
  const orders: Record<string, OrderRow> = {
    o1: {
      id: 'o1',
      customerId: 'cust1',
      status: opts.orderStatus ?? 'pending',
      items: [
        { variantId: 'v1', quantity: 1 },
        { variantId: 'v2', quantity: 3 },
      ],
    },
  };
  const payments: PaymentRow[] = [
    {
      id: 'p1',
      orderId: 'o1',
      provider: 'mock',
      amount: 118000,
      status: 'pending',
      providerOrderId: 'po_1',
      ...opts.payment,
    },
  ];
  const events: Record<string, { eventId: string; processedAt: Date | null }> = {};

  const db = {
    order: {
      findUnique: jest.fn(
        async ({ where: { id }, include }: { where: { id: string }; include?: { payments?: boolean } }) => {
          const o = orders[id];
          if (!o) return null;
          return include?.payments
            ? { ...o, payments: payments.filter((p) => p.orderId === id).map((p) => ({ ...p })) }
            : { ...o };
        },
      ),
      update: jest.fn(async ({ where: { id }, data }: { where: { id: string }; data: Partial<OrderRow> }) => {
        Object.assign(orders[id]!, data);
        return orders[id];
      }),
    },
    payment: {
      findFirst: jest.fn(async ({ where }: { where: Partial<PaymentRow> }) => {
        const p = payments.find((row) =>
          Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v),
        );
        return p ? { ...p } : null;
      }),
      update: jest.fn(async ({ where: { id }, data }: { where: { id: string }; data: Partial<PaymentRow> }) => {
        const p = payments.find((row) => row.id === id)!;
        Object.assign(p, data);
        return { ...p };
      }),
    },
    webhookEvent: {
      findUnique: jest.fn(async ({ where: { eventId } }: { where: { eventId: string } }) => events[eventId] ?? null),
      upsert: jest.fn(async ({ where: { eventId } }: { where: { eventId: string } }) => {
        events[eventId] ??= { eventId, processedAt: null };
        return events[eventId];
      }),
      update: jest.fn(
        async ({ where: { eventId }, data }: { where: { eventId: string }; data: { processedAt: Date } }) => {
          Object.assign(events[eventId]!, data);
          return events[eventId];
        },
      ),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  } as unknown as PrismaService;
  return { db, prisma, orders, payments, events };
}

/** Fake gateway: every webhook is valid; the body carries the event fields. */
function makeProvider(kind: 'mock' | 'razorpay' = 'razorpay') {
  return {
    kind,
    createOrder: jest.fn(async (amount: number, receipt: string) => ({
      providerOrderId: `${kind}_order_${receipt}`,
      amount,
      currency: 'INR' as const,
      clientConfig: { provider: kind, providerOrderId: `${kind}_order_${receipt}`, amount },
    })),
    verifyWebhook: jest.fn((raw: Buffer): WebhookVerification => {
      const b = JSON.parse(raw.toString('utf8')) as { eventId: string; event: string; providerOrderId?: string };
      return {
        valid: true,
        eventId: b.eventId,
        event: b.event,
        providerOrderId: b.providerOrderId,
        providerPaymentId: `pay_${b.eventId}`,
        method: 'upi',
      };
    }),
    createRefund: jest.fn(),
  };
}

function build(storeOpts: Parameters<typeof makeStore>[0] = {}, kind: 'mock' | 'razorpay' = 'razorpay') {
  const store = makeStore(storeOpts);
  const provider = makeProvider(kind);
  const inventory = { confirmSale: jest.fn(), release: jest.fn() };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const cart = { removePurchased: jest.fn().mockResolvedValue(2) };
  const svc = new PaymentService(
    store.prisma,
    inventory as unknown as InventoryService,
    queue as unknown as QueueService,
    provider as unknown as PaymentProvider,
    cart as unknown as CartService,
  );
  return { svc, store, provider, inventory, queue, cart };
}

const webhook = (eventId: string, event: string, providerOrderId = 'po_1') =>
  Buffer.from(JSON.stringify({ eventId, event, providerOrderId }));

describe('PaymentService — cart clear on capture (A4)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('capture of a pending order clears the purchased lines once', async () => {
    const { svc, store, cart, queue } = build();
    const res = await svc.handleWebhook(webhook('evt_1', 'payment.captured'), 'sig');
    expect(res).toEqual({ status: 'processed' });
    expect(store.payments[0]!.status).toBe('captured');
    expect(store.orders.o1!.status).toBe('confirmed');
    expect(cart.removePurchased).toHaveBeenCalledTimes(1);
    expect(cart.removePurchased).toHaveBeenCalledWith('cust1', ['v1', 'v2']);
    expect(queue.enqueue).toHaveBeenCalledWith('notifications', 'order.confirmed', { orderId: 'o1' });
  });

  it('a replayed event (processedAt set) does not clear again', async () => {
    const { svc, cart } = build();
    await svc.handleWebhook(webhook('evt_1', 'payment.captured'), 'sig');
    const again = await svc.handleWebhook(webhook('evt_1', 'payment.captured'), 'sig');
    expect(again).toEqual({ status: 'already_processed' });
    expect(cart.removePurchased).toHaveBeenCalledTimes(1);
  });

  it('an order that is no longer pending does not clear', async () => {
    const { svc, cart } = build({ orderStatus: 'confirmed' });
    await svc.handleWebhook(webhook('evt_2', 'payment.captured'), 'sig');
    expect(cart.removePurchased).not.toHaveBeenCalled();
  });

  it('a failed payment does not clear (cart kept for a retry)', async () => {
    const { svc, store, cart, inventory } = build();
    await svc.handleWebhook(webhook('evt_3', 'payment.failed'), 'sig');
    expect(store.orders.o1!.status).toBe('cancelled');
    expect(inventory.release).toHaveBeenCalledTimes(2);
    expect(cart.removePurchased).not.toHaveBeenCalled();
  });

  it('a cart-clear failure is logged and does not fail the capture', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, store, cart, queue } = build();
    cart.removePurchased.mockRejectedValueOnce(new Error('db down'));
    const res = await svc.handleWebhook(webhook('evt_4', 'payment.captured'), 'sig');
    expect(res).toEqual({ status: 'processed' });
    expect(store.payments[0]!.status).toBe('captured');
    expect(queue.enqueue).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Cart clear failed for order o1'));
  });
});
