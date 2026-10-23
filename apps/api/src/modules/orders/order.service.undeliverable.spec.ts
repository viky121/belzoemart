import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UNDELIVERABLE_CANCEL_REASON } from '@belzo/shared';
import { QUEUES } from '../../common/queue/queue.constants';
import { OrderService } from './order.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import type { PaymentService } from '../checkout/payment.service';
import type { FulfilmentService } from './fulfilment.service';

function build(order: Record<string, any> | null, opts: { claimCount?: number; queueFails?: boolean } = {}) {
  const log: string[] = [];
  const enqueued: { queue: string; name: string; data: unknown }[] = [];
  const state = { order };
  const prisma = {
    order: {
      findUnique: async () => state.order,
      updateMany: async ({ where, data }: any) => {
        log.push(`claim:${where.status}`);
        if ((opts.claimCount ?? 1) === 1 && state.order) Object.assign(state.order, data);
        return { count: opts.claimCount ?? 1 };
      },
      update: async ({ data }: any) => {
        Object.assign(state.order as object, data);
        return state.order;
      },
    },
  } as unknown as PrismaService;
  const inventory = {
    release: async (v: string) => void log.push(`release:${v}`),
    adjust: async (v: string, q: number, why: string) => void log.push(`adjust:${v}:${q}:${why}`),
  } as unknown as InventoryService;
  const payments = { refund: async (id: string, amt: number) => void log.push(`refund:${id}:${amt}`) } as unknown as PaymentService;
  const fulfilment = { cancelShipmentsForOrder: async (id: string) => void log.push(`ship:${id}`) } as unknown as FulfilmentService;
  const queue = {
    enqueue: async (queueName: string, name: string, data: unknown) => {
      if (opts.queueFails) throw new Error('redis down');
      enqueued.push({ queue: queueName, name, data });
    },
  } as unknown as QueueService;
  return { svc: new OrderService(prisma, inventory, payments, {} as CartService, fulfilment, queue), log, enqueued, state };
}

const base = (over: Record<string, any> = {}) => ({
  id: 'o1',
  customerId: 'c1',
  status: 'out_for_delivery',
  grandTotal: 49900,
  cancelledReason: null,
  items: [{ variantId: 'v1', quantity: 2 }],
  payments: [{ status: 'captured', provider: 'razorpay' }],
  ...over,
});

describe('OrderService.cancelUndeliverable (FD2 = A, BR-D56)', () => {
  it('cancels an out-for-delivery order with the fixed reason, restocks and refunds the online payment', async () => {
    const { svc, log, state } = build(base());
    const r = await svc.cancelUndeliverable('o1');
    expect(r).toEqual({ orderId: 'o1', changed: true });
    expect(state.order).toMatchObject({ status: 'cancelled', cancelledReason: UNDELIVERABLE_CANCEL_REASON });
    expect(log).toEqual(['claim:out_for_delivery', 'adjust:v1:2:undeliverable:o1', 'ship:o1', 'refund:o1:49900']);
  });

  it('works from shipped too, and from earlier states', async () => {
    for (const status of ['shipped', 'packed', 'confirmed']) {
      const { svc } = build(base({ status }));
      expect((await svc.cancelUndeliverable('o1')).changed).toBe(true);
    }
  });

  it('releases reserved stock for a pending order instead of restocking', async () => {
    const { svc, log } = build(base({ status: 'pending', payments: [] }));
    await svc.cancelUndeliverable('o1');
    expect(log).toContain('release:v1');
    expect(log.some((l) => l.startsWith('adjust'))).toBe(false);
  });

  it('does not refund cash on delivery or a payment that was never captured', async () => {
    const cod = build(base({ payments: [{ status: 'captured', provider: 'cod' }] }));
    await cod.svc.cancelUndeliverable('o1');
    const pending = build(base({ payments: [{ status: 'pending', provider: 'cod' }] }));
    await pending.svc.cancelUndeliverable('o1');
    expect(cod.log.some((l) => l.startsWith('refund'))).toBe(false);
    expect(pending.log.some((l) => l.startsWith('refund'))).toBe(false);
  });

  it('refuses a delivered or returned order, and an unknown one', async () => {
    await expect(build(base({ status: 'delivered' })).svc.cancelUndeliverable('o1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(base({ status: 'returned' })).svc.cancelUndeliverable('o1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(null).svc.cancelUndeliverable('o1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is safe to run twice: the second run changes nothing and does not restock again', async () => {
    const t = build(base({ payments: [{ status: 'refunded', provider: 'razorpay' }] }));
    await t.svc.cancelUndeliverable('o1');
    const before = t.log.length;
    const second = await t.svc.cancelUndeliverable('o1');
    expect(second.changed).toBe(false);
    expect(t.log.length).toBe(before);
  });

  it('retries a refund that did not go through if the order was already cancelled for this reason', async () => {
    const t = build(base({ status: 'cancelled', cancelledReason: UNDELIVERABLE_CANCEL_REASON }));
    const r = await t.svc.cancelUndeliverable('o1');
    expect(r.changed).toBe(false);
    expect(t.log).toEqual(['refund:o1:49900']);
  });

  it('leaves an order cancelled for another reason alone', async () => {
    const t = build(base({ status: 'cancelled', cancelledReason: 'Customer changed mind' }));
    expect((await t.svc.cancelUndeliverable('o1')).changed).toBe(false);
    expect(t.log).toEqual([]);
  });

  it('does nothing when another caller got there first', async () => {
    const t = build(base(), { claimCount: 0 });
    expect((await t.svc.cancelUndeliverable('o1')).changed).toBe(false);
    expect(t.log).toEqual(['claim:out_for_delivery']);
  });
});

describe('OrderService.cancel tells the delivery module (BR-D58)', () => {
  const cancellable = (over: Record<string, any> = {}) => base({ status: 'packed', payments: [], ...over });

  it('queues order.cancelled on the delivery queue', async () => {
    const { svc, enqueued } = build(cancellable());
    await svc.cancel('o1', { isAdmin: true }, 'stock problem');
    expect(enqueued).toEqual([{ queue: QUEUES.DELIVERY, name: 'order.cancelled', data: { orderId: 'o1' } }]);
  });

  it('still cancels when the queue is down', async () => {
    const { svc, state } = build(cancellable(), { queueFails: true });
    await expect(svc.cancel('o1', { isAdmin: true }, 'stock problem')).resolves.toMatchObject({ status: 'cancelled' });
    expect(state.order?.status).toBe('cancelled');
  });

  it('does not queue anything when the cancel is refused', async () => {
    const { svc, enqueued } = build(base({ status: 'delivered', payments: [] }));
    await expect(svc.cancel('o1', { isAdmin: true }, 'late')).rejects.toBeInstanceOf(BadRequestException);
    expect(enqueued).toEqual([]);
  });

  it('customers still cannot cancel once the order has shipped (rules unchanged)', async () => {
    const { svc } = build(base({ status: 'shipped', payments: [] }));
    await expect(svc.cancel('o1', { customerId: 'c1' }, 'changed my mind')).rejects.toBeInstanceOf(BadRequestException);
  });
});
