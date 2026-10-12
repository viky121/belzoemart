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
      // Honours every `where` field (id, status, providerOrderId: null) like a
      // single conditional SQL UPDATE, and returns the matched count.
      updateMany: jest.fn(
        async ({ where, data }: { where: Partial<PaymentRow>; data: Partial<PaymentRow> }) => {
          let count = 0;
          for (const row of payments) {
            const match = Object.entries(where).every(
              ([k, v]) => (row as unknown as Record<string, unknown>)[k] === v,
            );
            if (match) {
              Object.assign(row, data);
              count++;
            }
          }
          return { count };
        },
      ),
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

describe('PaymentService.initiate — idempotent (A7)', () => {
  const CLAIM = { where: { id: 'p1', status: 'created' }, data: { status: 'pending' } };

  it.each(['captured', 'pending', 'failed', 'refunded', 'partially_refunded'])(
    'leaves a %s payment untouched and returns an empty clientConfig',
    async (status) => {
      const { svc, store, provider } = build({ payment: { status, providerOrderId: 'po_1' } }, 'mock');
      const res = await svc.initiate('o1');
      expect(res).toEqual({ provider: 'mock', clientConfig: {} });
      expect(provider.createOrder).not.toHaveBeenCalled();
      expect(store.db.payment.update).not.toHaveBeenCalled();
      // The only write attempt is the conditional claim, which matches 0 rows.
      expect(store.db.payment.updateMany).toHaveBeenCalledTimes(1);
      expect(store.db.payment.updateMany).toHaveBeenCalledWith(CLAIM);
      expect(store.payments[0]).toMatchObject({ status, providerOrderId: 'po_1' });
    },
  );

  it('initiates a created payment once; the update writes only providerOrderId; mock auto-captures', async () => {
    const { svc, store, provider } = build({ payment: { status: 'created', providerOrderId: null } }, 'mock');
    const res = await svc.initiate('o1');
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(provider.createOrder).toHaveBeenCalledWith(118000, 'o1');
    expect(res).toEqual({
      provider: 'mock',
      clientConfig: { provider: 'mock', providerOrderId: 'mock_order_o1', amount: 118000 },
    });
    expect(store.db.payment.updateMany).toHaveBeenCalledWith(CLAIM);
    // First update is initiate's own: providerOrderId only, never status.
    expect(store.db.payment.update.mock.calls[0]![0]).toEqual({
      where: { id: 'p1' },
      data: { providerOrderId: 'mock_order_o1' },
    });
    expect(store.payments[0]).toMatchObject({ status: 'captured', providerOrderId: 'mock_order_o1' });
    expect(store.orders.o1!.status).toBe('confirmed');
  });

  it('a later sequential replay does nothing', async () => {
    const { svc, store, provider } = build({ payment: { status: 'created', providerOrderId: null } }, 'mock');
    await svc.initiate('o1');
    const again = await svc.initiate('o1');
    expect(again).toEqual({ provider: 'mock', clientConfig: {} });
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.payments[0]).toMatchObject({ status: 'captured', providerOrderId: 'mock_order_o1' });
  });

  it('two concurrent initiate calls create exactly one gateway order', async () => {
    const { svc, store, provider } = build({ payment: { status: 'created', providerOrderId: null } }, 'mock');
    const results = await Promise.all([svc.initiate('o1'), svc.initiate('o1')]);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    const real = results.filter((r) => Object.keys(r.clientConfig).length > 0);
    const empty = results.filter((r) => Object.keys(r.clientConfig).length === 0);
    expect(real).toHaveLength(1);
    expect(empty).toHaveLength(1);
    expect(real[0]!.clientConfig).toMatchObject({ providerOrderId: 'mock_order_o1' });
    expect(store.payments[0]).toMatchObject({ status: 'captured', providerOrderId: 'mock_order_o1' });
  });

  it('reverts the claim when createOrder rejects, so a retry can initiate again', async () => {
    const { svc, store, provider } = build({ payment: { status: 'created', providerOrderId: null } }, 'mock');
    provider.createOrder.mockRejectedValueOnce(new Error('gateway down'));
    await expect(svc.initiate('o1')).rejects.toThrow('gateway down');
    expect(store.payments[0]).toMatchObject({ status: 'created', providerOrderId: null });
    expect(store.db.payment.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'p1', status: 'pending', providerOrderId: null },
      data: { status: 'created' },
    });
    expect(store.db.payment.update).not.toHaveBeenCalled();

    const res = await svc.initiate('o1');
    expect(provider.createOrder).toHaveBeenCalledTimes(2);
    expect(res.clientConfig).toMatchObject({ providerOrderId: 'mock_order_o1' });
    expect(store.payments[0]).toMatchObject({ status: 'captured', providerOrderId: 'mock_order_o1' });
  });

  it('COD is unchanged', async () => {
    const { svc, store, provider } = build({ payment: { provider: 'cod', status: 'pending', providerOrderId: null } });
    expect(await svc.initiate('o1')).toEqual({ provider: 'cod', clientConfig: { cod: true } });
    expect(store.db.payment.updateMany).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });
});
