import { BadRequestException } from '@nestjs/common';
import { QUEUES } from '../../common/queue/queue.constants';
import { notifyOrderStatus } from './order-events';
import { FulfilmentService } from './fulfilment.service';
import { OrderService } from './order.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import type { PaymentService } from '../checkout/payment.service';

/** A self pickup order: Confirmed, Ready for pickup (packed), Picked up (delivered). No shipment, no courier. */
interface OrderRow {
  id: string;
  status: string;
  fulfilment: 'delivery' | 'pickup';
  items: { variantId: string; quantity: number }[];
  payments: { provider: string; status: string; method: string | null }[];
}

function build(order: Partial<OrderRow>) {
  const state: OrderRow = {
    id: 'o1',
    status: 'confirmed',
    fulfilment: 'pickup',
    items: [{ variantId: 'v1', quantity: 1 }],
    payments: [{ provider: 'cod', status: 'pending', method: null }],
    ...order,
  };
  const enqueued: { queue: string; name: string; data: unknown; opts?: unknown }[] = [];
  const paymentUpdates: unknown[] = [];
  const prisma = {
    order: {
      findUnique: async () => state,
      update: ({ data }: { data: Partial<OrderRow> }) => {
        Object.assign(state, data);
        return Promise.resolve(state);
      },
    },
    payment: {
      updateMany: (args: { where: { orderId: string; provider: string; status: string }; data: { status: string; method: string } }) => {
        paymentUpdates.push(args);
        for (const p of state.payments) {
          if (p.provider === args.where.provider && p.status === args.where.status) Object.assign(p, args.data);
        }
        return Promise.resolve({ count: 1 });
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as PrismaService;
  const queue = {
    enqueue: async (queueName: string, name: string, data: unknown, opts?: unknown) => {
      enqueued.push({ queue: queueName, name, data, opts });
    },
  } as unknown as QueueService;
  const svc = new OrderService(prisma, {} as InventoryService, {} as PaymentService, {} as CartService, {} as FulfilmentService, queue);
  return { svc, state, enqueued, paymentUpdates };
}

describe('OrderService.transition for a self pickup order', () => {
  it('Ready for pickup: confirmed to packed, and tells the customer once', async () => {
    const { svc, state, enqueued } = build({});
    await svc.transition('o1', 'packed');
    expect(state.status).toBe('packed');
    expect(enqueued).toEqual([
      { queue: QUEUES.NOTIFICATIONS, name: 'order.ready_for_pickup', data: { orderId: 'o1' }, opts: { jobId: 'order.ready_for_pickup-o1' } },
    ]);
  });

  it('Picked up: packed to delivered, and the money paid at the shop is marked received', async () => {
    const { svc, state, paymentUpdates } = build({ status: 'packed' });
    await svc.transition('o1', 'delivered');
    expect(state.status).toBe('delivered');
    expect(paymentUpdates).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({ provider: 'cod', status: 'captured', method: 'pay_at_shop' });
  });

  it('Picked up with an online payment already captured leaves that payment alone', async () => {
    const { svc, state } = build({ status: 'packed', payments: [{ provider: 'razorpay', status: 'captured', method: 'upi' }] });
    await svc.transition('o1', 'delivered');
    expect(state.payments[0]).toMatchObject({ provider: 'razorpay', status: 'captured', method: 'upi' });
  });

  it('is never shipped: packed to shipped and confirmed to delivered are refused', async () => {
    const a = build({ status: 'packed' });
    await expect(a.svc.transition('o1', 'shipped')).rejects.toBeInstanceOf(BadRequestException);
    const b = build({ status: 'confirmed' });
    await expect(b.svc.transition('o1', 'delivered')).rejects.toBeInstanceOf(BadRequestException);
    expect(b.state.status).toBe('confirmed');
  });
});

describe('OrderService.transition for home delivery is unchanged', () => {
  it('packed to delivered is still refused, shipped is allowed and the payment is untouched', async () => {
    const a = build({ status: 'packed', fulfilment: 'delivery' });
    await expect(a.svc.transition('o1', 'delivered')).rejects.toBeInstanceOf(BadRequestException);
    const b = build({ status: 'packed', fulfilment: 'delivery' });
    await b.svc.transition('o1', 'shipped');
    expect(b.state.status).toBe('shipped');
    expect(b.paymentUpdates).toHaveLength(0);
    expect(b.enqueued.map((e) => e.name)).toEqual(['order.shipped']);
  });

  it('packing a delivery order sends no ready-for-pickup message', async () => {
    const { svc, enqueued } = build({ fulfilment: 'delivery' });
    await svc.transition('o1', 'packed');
    expect(enqueued).toHaveLength(0);
  });
});

describe('notifyOrderStatus', () => {
  const calls: string[] = [];
  const queue = { enqueue: async (_q: string, name: string) => void calls.push(name) } as unknown as QueueService;
  beforeEach(() => void (calls.length = 0));

  it('pickup: packed means ready for pickup, delivered means picked up (the delivered mail)', async () => {
    await notifyOrderStatus(queue, 'o1', 'packed', 'pickup');
    await notifyOrderStatus(queue, 'o1', 'delivered', 'pickup');
    expect(calls).toEqual(['order.ready_for_pickup', 'order.delivered']);
  });
  it('delivery: packed sends nothing, as before', async () => {
    await notifyOrderStatus(queue, 'o1', 'packed');
    await notifyOrderStatus(queue, 'o1', 'shipped');
    expect(calls).toEqual(['order.shipped']);
  });
  it('a queue failure never fails the action', async () => {
    const broken = { enqueue: async () => Promise.reject(new Error('redis down')) } as unknown as QueueService;
    await expect(notifyOrderStatus(broken, 'o1', 'packed', 'pickup')).resolves.toBeUndefined();
  });
});

describe('no shipment for a self pickup order', () => {
  function fulfilment(fulfilmentValue: 'delivery' | 'pickup') {
    const prisma = {
      order: {
        findUnique: async () => ({ id: 'o1', fulfilment: fulfilmentValue, addressId: 'a1', status: 'confirmed', codFee: 0, grandTotal: 100, items: [] }),
      },
    } as unknown as PrismaService;
    return new FulfilmentService(prisma, {} as never, {} as never);
  }
  it('isPickupOrder tells the worker to skip it', async () => {
    expect(await fulfilment('pickup').isPickupOrder('o1')).toBe(true);
    expect(await fulfilment('delivery').isPickupOrder('o1')).toBe(false);
  });
  it('creating a shipment for it is refused with a clear message', async () => {
    await expect(fulfilment('pickup').createShipment('o1')).rejects.toThrow(/self pickup order/);
  });
});
