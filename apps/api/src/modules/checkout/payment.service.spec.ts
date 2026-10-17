import { Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import type {
  PaymentProvider,
  ProviderPayment,
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
  createdAt?: Date;
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
      // Conditional update like SQL: only matches while the status still equals `where.status`.
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: string; status?: string }; data: Partial<OrderRow> }) => {
          const o = orders[where.id];
          if (!o || (where.status !== undefined && o.status !== where.status)) return { count: 0 };
          Object.assign(o, data);
          return { count: 1 };
        },
      ),
    },
    payment: {
      findMany: jest.fn(
        async ({ where, take }: { where: { status: { in: string[] }; createdAt: { lt: Date } }; take?: number }) =>
          payments
            .filter(
              (p) =>
                where.status.in.includes(p.status) &&
                (p.createdAt ?? new Date(0)) < where.createdAt.lt &&
                orders[p.orderId]?.status === 'pending',
            )
            .slice(0, take ?? 100)
            .map((p) => ({ ...p })),
      ),
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
      const b = JSON.parse(raw.toString('utf8')) as {
        eventId: string;
        event: string;
        providerOrderId?: string;
        amount?: number;
      };
      return {
        valid: true,
        eventId: b.eventId,
        event: b.event,
        providerOrderId: b.providerOrderId,
        providerPaymentId: `pay_${b.eventId}`,
        method: 'upi',
        amount: b.amount,
      };
    }),
    verifyCheckoutSignature: jest.fn((_o: string, _p: string, sig: string) => sig === 'good'),
    listOrderPayments: jest.fn(async (): Promise<ProviderPayment[]> => []),
    capturePayment: jest.fn(),
    clientConfigFor: jest.fn((id: string, amount: number) => ({ provider: kind, orderId: id, amount, key: 'rzp_live_x' })),
    createRefund: jest.fn(async (_id: string, amount: number) => ({
      providerRefundId: 'rf_1',
      amount,
      status: 'processed' as const,
    })),
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

  it('a failed attempt keeps the order open so the customer can retry (cart kept, stock kept)', async () => {
    const { svc, store, cart, inventory } = build();
    const res = await svc.handleWebhook(webhook('evt_3', 'payment.failed'), 'sig');
    expect(res).toEqual({ status: 'processed' });
    expect(store.orders.o1!.status).toBe('pending');
    expect(store.payments[0]!.status).toBe('pending');
    expect(inventory.release).not.toHaveBeenCalled();
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

const paid = (over: Partial<ProviderPayment> = {}): ProviderPayment => ({
  id: 'pay_real',
  providerOrderId: 'po_1',
  status: 'captured',
  amount: 118000,
  method: 'upi',
  ...over,
});
const proof = (over: Partial<{ razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }> = {}) => ({
  razorpayOrderId: 'po_1',
  razorpayPaymentId: 'pay_real',
  razorpaySignature: 'good',
  ...over,
});

describe('PaymentService — webhook hardening', () => {
  it('rejects a captured event whose amount differs from the order, and does not confirm', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc, store } = build();
    const body = Buffer.from(
      JSON.stringify({ eventId: 'evt_amt', event: 'payment.captured', providerOrderId: 'po_1', amount: 100 }),
    );
    expect(await svc.handleWebhook(body, 'sig')).toEqual({ status: 'amount_mismatch' });
    expect(store.orders.o1!.status).toBe('pending');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('amount mismatch'));
    error.mockRestore();
  });

  it('accepts a captured event with the right amount', async () => {
    const { svc, store } = build();
    const body = Buffer.from(
      JSON.stringify({ eventId: 'evt_ok', event: 'payment.captured', providerOrderId: 'po_1', amount: 118000 }),
    );
    expect(await svc.handleWebhook(body, 'sig')).toEqual({ status: 'processed' });
    expect(store.orders.o1!.status).toBe('confirmed');
  });

  it('passes the delivery id header to the provider', async () => {
    const { svc, provider } = build();
    await svc.handleWebhook(webhook('evt_h', 'payment.failed'), 'sig', 'delivery-1');
    expect(provider.verifyWebhook).toHaveBeenCalledWith(expect.any(Buffer), 'sig', 'delivery-1');
  });

  it('on payment.authorized, captures the held payment and confirms the order', async () => {
    const { svc, store, provider } = build();
    provider.listOrderPayments.mockResolvedValueOnce([paid({ status: 'authorized' })]);
    provider.capturePayment.mockResolvedValueOnce(paid({ status: 'captured' }));
    await svc.handleWebhook(webhook('evt_auth', 'payment.authorized'), 'sig');
    expect(provider.capturePayment).toHaveBeenCalledWith('pay_real', 118000);
    expect(store.orders.o1!.status).toBe('confirmed');
    expect(store.payments[0]).toMatchObject({ status: 'captured', providerPaymentId: 'pay_real' });
  });

  it('two simultaneous confirmations of one order confirm it exactly once', async () => {
    const { svc, inventory, queue, cart } = build();
    await Promise.all([
      svc.handleWebhook(webhook('evt_a', 'payment.captured'), 'sig'),
      svc.handleWebhook(webhook('evt_b', 'order.paid'), 'sig'),
    ]);
    expect(inventory.confirmSale).toHaveBeenCalledTimes(2); // 2 lines, once
    expect(cart.removePurchased).toHaveBeenCalledTimes(1);
    expect(queue.enqueue.mock.calls.filter((c) => c[1] === 'order.confirmed')).toHaveLength(3);
  });

  it('refunds automatically when money arrives for an order that was already cancelled', async () => {
    const { svc, store, provider, inventory } = build({ orderStatus: 'cancelled' });
    await svc.handleWebhook(webhook('evt_late', 'payment.captured'), 'sig');
    expect(store.orders.o1!.status).toBe('cancelled');
    expect(inventory.confirmSale).not.toHaveBeenCalled();
    expect(provider.createRefund).toHaveBeenCalledWith('pay_evt_late', 118000);
    expect(store.payments[0]!.status).toBe('refunded');
  });

  it('flags (does not throw) when the automatic refund itself fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc, provider } = build({ orderStatus: 'cancelled' });
    provider.createRefund.mockRejectedValueOnce(new Error('gateway down'));
    await expect(svc.handleWebhook(webhook('evt_late2', 'payment.captured'), 'sig')).resolves.toEqual({
      status: 'processed',
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('REFUND NEEDED'));
    error.mockRestore();
  });
});

describe('PaymentService.verifyClientPayment', () => {
  it('confirms the order when the signature is valid and the gateway shows it captured', async () => {
    const { svc, store, provider } = build();
    provider.listOrderPayments.mockResolvedValueOnce([paid()]);
    expect(await svc.verifyClientPayment('cust1', 'o1', proof())).toEqual({ status: 'paid' });
    expect(provider.verifyCheckoutSignature).toHaveBeenCalledWith('po_1', 'pay_real', 'good');
    expect(store.orders.o1!.status).toBe('confirmed');
  });

  it('rejects a forged signature and changes nothing', async () => {
    const { svc, store, provider } = build();
    await expect(svc.verifyClientPayment('cust1', 'o1', proof({ razorpaySignature: 'forged' }))).rejects.toThrow(
      'Invalid payment signature',
    );
    expect(provider.listOrderPayments).not.toHaveBeenCalled();
    expect(store.orders.o1!.status).toBe('pending');
  });

  it('rejects a payment that belongs to a different gateway order', async () => {
    const { svc } = build();
    await expect(svc.verifyClientPayment('cust1', 'o1', proof({ razorpayOrderId: 'po_other' }))).rejects.toThrow(
      'does not belong',
    );
  });

  it("hides other customers' orders", async () => {
    const { svc } = build();
    await expect(svc.verifyClientPayment('someone-else', 'o1', proof())).rejects.toThrow('Order not found');
  });

  it('does not confirm when the gateway shows a different amount than the order', async () => {
    const { svc, store, provider } = build();
    provider.listOrderPayments.mockResolvedValueOnce([paid({ amount: 5000 })]);
    expect(await svc.verifyClientPayment('cust1', 'o1', proof())).toEqual({ status: 'processing' });
    expect(store.orders.o1!.status).toBe('pending');
  });

  it('reports "processing" (not an error) when the gateway cannot be reached', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, provider } = build();
    provider.listOrderPayments.mockRejectedValueOnce(new Error('timeout'));
    expect(await svc.verifyClientPayment('cust1', 'o1', proof())).toEqual({ status: 'processing' });
    warn.mockRestore();
  });
});

describe('PaymentService.syncOrder / paymentConfigForOrder', () => {
  it('sync confirms an order the gateway reports as paid', async () => {
    const { svc, store, provider } = build();
    provider.listOrderPayments.mockResolvedValueOnce([paid()]);
    expect(await svc.syncOrder('cust1', 'o1')).toEqual({ status: 'paid' });
    expect(store.orders.o1!.status).toBe('confirmed');
  });

  it('sync leaves an unpaid order processing, and skips the gateway for settled orders', async () => {
    const a = build();
    expect(await a.svc.syncOrder('cust1', 'o1')).toEqual({ status: 'processing' });
    const b = build({ orderStatus: 'confirmed' });
    expect(await b.svc.syncOrder('cust1', 'o1')).toEqual({ status: 'paid' });
    expect(b.provider.listOrderPayments).not.toHaveBeenCalled();
    const c = build({ orderStatus: 'cancelled' });
    expect(await c.svc.syncOrder('cust1', 'o1')).toEqual({ status: 'cancelled' });
  });

  it('pay-again returns the existing gateway order config for an unpaid order', async () => {
    const { svc, provider } = build();
    const res = await svc.paymentConfigForOrder('cust1', 'o1');
    expect(res).toMatchObject({ alreadyPaid: false, amount: 118000, clientConfig: { orderId: 'po_1', amount: 118000 } });
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it('pay-again refuses to start a second payment when the first already went through', async () => {
    const { svc, provider, store } = build();
    provider.listOrderPayments.mockResolvedValueOnce([paid()]);
    const res = await svc.paymentConfigForOrder('cust1', 'o1');
    expect(res.alreadyPaid).toBe(true);
    expect(res.clientConfig).toEqual({});
    expect(store.orders.o1!.status).toBe('confirmed');
  });

  it('pay-again on a cancelled order is a conflict', async () => {
    const { svc } = build({ orderStatus: 'cancelled' });
    await expect(svc.paymentConfigForOrder('cust1', 'o1')).rejects.toThrow('cancelled');
  });

  it('pay-again creates the gateway order if the first attempt never got one', async () => {
    const { svc, provider } = build({ payment: { status: 'created', providerOrderId: null } });
    const res = await svc.paymentConfigForOrder('cust1', 'o1');
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(res.clientConfig).toMatchObject({ providerOrderId: 'razorpay_order_o1' });
  });

  it('COD orders have no online payment to sync', async () => {
    const { svc } = build({ payment: { provider: 'cod', providerOrderId: null } });
    await expect(svc.syncOrder('cust1', 'o1')).rejects.toThrow('no online payment');
  });
});

describe('PaymentService.expireAbandoned', () => {
  const old = new Date(Date.now() - 60 * 60 * 1000);

  it('cancels an unpaid online order after the gateway confirms nothing was paid, releasing stock', async () => {
    const { svc, store, inventory, queue } = build({ payment: { provider: 'razorpay', createdAt: old } });
    const res = await svc.expireAbandoned(30 * 60 * 1000);
    expect(res).toEqual({ checked: 1, cancelled: 1, confirmed: 0 });
    expect(store.orders.o1!.status).toBe('cancelled');
    expect(store.payments[0]!.status).toBe('failed');
    expect(inventory.release).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledWith('notifications', 'order.payment_failed', { orderId: 'o1' });
  });

  it('confirms instead of cancelling when the customer actually paid', async () => {
    const { svc, store, provider } = build({ payment: { provider: 'razorpay', createdAt: old } });
    provider.listOrderPayments.mockResolvedValueOnce([paid()]);
    expect(await svc.expireAbandoned(30 * 60 * 1000)).toEqual({ checked: 1, cancelled: 0, confirmed: 1 });
    expect(store.orders.o1!.status).toBe('confirmed');
  });

  it('leaves the order alone when the gateway cannot be reached (it might be paid)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc, store, provider } = build({ payment: { provider: 'razorpay', createdAt: old } });
    provider.listOrderPayments.mockRejectedValueOnce(new Error('down'));
    expect(await svc.expireAbandoned(30 * 60 * 1000)).toEqual({ checked: 1, cancelled: 0, confirmed: 0 });
    expect(store.orders.o1!.status).toBe('pending');
    warn.mockRestore();
  });

  it('does not touch recent orders', async () => {
    const { svc, store } = build({ payment: { provider: 'razorpay', createdAt: new Date() } });
    expect(await svc.expireAbandoned(30 * 60 * 1000)).toEqual({ checked: 0, cancelled: 0, confirmed: 0 });
    expect(store.orders.o1!.status).toBe('pending');
  });

  it('cancels an order whose gateway order was never created, without asking the gateway', async () => {
    const { svc, store, provider } = build({
      payment: { provider: 'razorpay', status: 'created', providerOrderId: null, createdAt: old },
    });
    expect(await svc.expireAbandoned(30 * 60 * 1000)).toEqual({ checked: 1, cancelled: 1, confirmed: 0 });
    expect(provider.listOrderPayments).not.toHaveBeenCalled();
    expect(store.orders.o1!.status).toBe('cancelled');
  });
});
