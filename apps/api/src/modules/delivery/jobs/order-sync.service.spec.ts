import { Logger } from '@nestjs/common';
import { DELIVERY_MOVES } from '@belzo/shared';
import { OrderSyncService, INHOUSE_COURIER, INHOUSE_PROVIDER } from './order-sync.service';
import type { ShippingProvider } from '../../../integrations/shipping/shipping.provider';
import type { OrderService } from '../../orders/order.service';
import type { Tx } from './job.repository';

const NOW = new Date('2026-10-23T10:00:00Z');

function build(opts: { orderStatus?: string; shipments?: Record<string, any>[]; cancelFails?: boolean; undeliverableFails?: boolean } = {}) {
  const orderUpdates: string[] = [];
  const events: { shipmentId: string; status: string; description: string }[] = [];
  const shipments: Record<string, any>[] = (opts.shipments ?? []).map((s) => ({ createdAt: NOW, ...s }));
  const created: Record<string, any>[] = [];
  const order = { status: opts.orderStatus ?? 'confirmed' };
  const tx = {
    shipment: {
      findMany: async () => shipments.filter((s) => !['delivered', 'cancelled', 'rto'].includes(s.status)),
      findUnique: async ({ where }: any) => shipments.find((s) => s.id === where.id) ?? created.find((s) => s.id === where.id) ?? null,
      update: async ({ where, data }: any) => Object.assign((shipments.find((s) => s.id === where.id) ?? created.find((s) => s.id === where.id)) as object, data),
      create: async ({ data }: any) => {
        const row = { id: `new-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      },
    },
    trackingEvent: { create: async ({ data }: any) => void events.push(data) },
    order: {
      findUnique: async () => order,
      update: async ({ data }: any) => {
        order.status = data.status;
        orderUpdates.push(data.status);
      },
    },
  } as unknown as Tx;
  const cancelled: string[] = [];
  const shipping = {
    cancelShipment: async (awb: string) => {
      if (opts.cancelFails) throw new Error('courier down');
      cancelled.push(awb);
    },
  } as unknown as ShippingProvider;
  const undeliverable: string[] = [];
  const orders = {
    cancelUndeliverable: async (id: string) => {
      if (opts.undeliverableFails) throw new Error('db down');
      undeliverable.push(id);
    },
  } as unknown as OrderService;
  return { svc: new OrderSyncService(shipping, orders), tx, order, orderUpdates, events, shipments, created, cancelled, undeliverable };
}

describe('OrderSyncService.attachInhouseShipment', () => {
  it('creates an in-house shipment when the order has none', async () => {
    const t = build();
    const r = await t.svc.attachInhouseShipment(t.tx, 'o1', 'DLV-ABCD2345', NOW);
    expect(r.takenOver).toEqual([]);
    expect(t.created[0]).toMatchObject({ orderId: 'o1', provider: INHOUSE_PROVIDER, awb: 'DLV-ABCD2345', courier: INHOUSE_COURIER, status: 'packed' });
    expect(r.shipmentId).toBe('new-1');
  });

  it('takes over the mock shipment instead of leaving a cancelled one next to a new one', async () => {
    const t = build({ shipments: [{ id: 's1', orderId: 'o1', provider: 'mock', awb: 'MOCKAWB1', status: 'packed' }] });
    const r = await t.svc.attachInhouseShipment(t.tx, 'o1', 'DLV-ABCD2345', NOW);
    expect(r.shipmentId).toBe('s1');
    expect(t.shipments[0]).toMatchObject({ provider: INHOUSE_PROVIDER, awb: 'DLV-ABCD2345', courier: INHOUSE_COURIER, status: 'packed' });
    expect(t.created).toHaveLength(0);
    expect(r.takenOver).toEqual([{ provider: 'mock', awb: 'MOCKAWB1' }]);
  });

  it('cancels any extra open shipments and reports them', async () => {
    const t = build({
      shipments: [
        { id: 's2', orderId: 'o1', provider: 'shiprocket', awb: 'SR2', status: 'packed', createdAt: new Date(NOW.getTime() + 1000) },
        { id: 's1', orderId: 'o1', provider: 'shiprocket', awb: 'SR1', status: 'packed' },
      ],
    });
    // the service picks the first row returned (newest) to keep
    const r = await t.svc.attachInhouseShipment(t.tx, 'o1', 'DLV-ABCD2345', NOW);
    expect(r.shipmentId).toBe('s2');
    expect(t.shipments.find((s) => s.id === 's1')?.status).toBe('cancelled');
    expect(t.events).toContainEqual({ shipmentId: 's1', status: 'cancelled', description: 'Shipment cancelled', occurredAt: NOW });
    expect(r.takenOver.map((x) => x.awb).sort()).toEqual(['SR1', 'SR2']);
  });

  it('ignores shipments that are already finished', async () => {
    const t = build({ shipments: [{ id: 's1', orderId: 'o1', provider: 'mock', awb: 'X', status: 'cancelled' }] });
    const r = await t.svc.attachInhouseShipment(t.tx, 'o1', 'DLV-ABCD2345', NOW);
    expect(r.shipmentId).toBe('new-1');
    expect(t.shipments[0]?.status).toBe('cancelled');
  });
});

describe('OrderSyncService.releaseCourierShipments', () => {
  beforeEach(() => void jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('tells a real courier but not the mock or an in-house shipment', async () => {
    const t = build();
    await t.svc.releaseCourierShipments([
      { provider: 'shiprocket', awb: 'SR1' },
      { provider: 'mock', awb: 'MOCKAWB1' },
      { provider: INHOUSE_PROVIDER, awb: 'DLV-1' },
      { provider: 'shiprocket', awb: null },
    ]);
    expect(t.cancelled).toEqual(['SR1']);
  });

  it('never throws when the courier is down', async () => {
    const t = build({ cancelFails: true });
    await expect(t.svc.releaseCourierShipments([{ provider: 'shiprocket', awb: 'SR1' }])).resolves.toBeUndefined();
  });
});

describe('OrderSyncService.apply', () => {
  const job = { orderId: 'o1', shipmentId: 's1' };
  const withShipment = (status = 'packed') => ({ shipments: [{ id: 's1', orderId: 'o1', provider: INHOUSE_PROVIDER, awb: 'DLV-1', status }] });

  it('assigned: the order goes from confirmed to packed and the customer sees the assignment', async () => {
    const t = build({ orderStatus: 'confirmed', ...withShipment() });
    await t.svc.apply(t.tx, job, 'assigned', NOW);
    expect(t.order.status).toBe('packed');
    expect(t.events).toEqual([{ shipmentId: 's1', status: 'assigned', description: 'Assigned to a delivery partner', occurredAt: NOW }]);
  });

  it('picked up, out for delivery and delivered walk the order and the shipment forward', async () => {
    const t = build({ orderStatus: 'packed', ...withShipment() });
    await t.svc.apply(t.tx, job, 'picked_up', NOW);
    expect([t.order.status, t.shipments[0]?.status]).toEqual(['shipped', 'shipped']);
    await t.svc.apply(t.tx, job, 'out_for_delivery', NOW);
    expect([t.order.status, t.shipments[0]?.status]).toEqual(['out_for_delivery', 'out_for_delivery']);
    await t.svc.apply(t.tx, job, 'delivered', NOW);
    expect([t.order.status, t.shipments[0]?.status]).toEqual(['delivered', 'delivered']);
    expect(t.events.map((e) => e.status)).toEqual(['picked_up', 'out_for_delivery', 'delivered']);
  });

  it('writes one order update for a multi-step walk (packed to out for delivery)', async () => {
    const t = build({ orderStatus: 'packed', ...withShipment() });
    await t.svc.apply(t.tx, job, 'out_for_delivery', NOW);
    expect(t.orderUpdates).toEqual(['out_for_delivery']);
  });

  it('never moves the order backwards', async () => {
    const t = build({ orderStatus: 'out_for_delivery', ...withShipment('out_for_delivery') });
    await t.svc.apply(t.tx, job, 'assigned', NOW); // a reassignment after pick-up
    await t.svc.apply(t.tx, job, 'picked_up', NOW);
    expect(t.order.status).toBe('out_for_delivery');
    expect(t.shipments[0]?.status).toBe('out_for_delivery');
    expect(t.orderUpdates).toEqual([]);
  });

  it('does not touch a pending, cancelled or returned order', async () => {
    for (const status of ['pending', 'cancelled', 'returned']) {
      const t = build({ orderStatus: status, ...withShipment() });
      await t.svc.apply(t.tx, job, 'picked_up', NOW);
      expect(t.order.status).toBe(status);
    }
  });

  it('a failed attempt only adds a customer-safe line; no status changes', async () => {
    const t = build({ orderStatus: 'out_for_delivery', ...withShipment('out_for_delivery') });
    await t.svc.apply(t.tx, job, 'failed_attempt', NOW);
    expect(t.order.status).toBe('out_for_delivery');
    expect(t.events[0]).toMatchObject({ status: 'failed_attempt', description: 'Delivery attempt unsuccessful. We will try again' });
  });

  it('returned: shipment goes to rto, and the caller is told to cancel the order after commit', async () => {
    const t = build({ orderStatus: 'out_for_delivery', ...withShipment('out_for_delivery') });
    const r = await t.svc.apply(t.tx, job, 'returned', NOW);
    expect(r.cancelOrderAfterCommit).toBe(true);
    expect(t.shipments[0]?.status).toBe('rto');
    expect(t.order.status).toBe('out_for_delivery'); // the order service does the cancel, with stock and refund
  });

  it('cancelled: the shipment is cancelled and the order is left as it is', async () => {
    const t = build({ orderStatus: 'shipped', ...withShipment('shipped') });
    const r = await t.svc.apply(t.tx, job, 'cancelled', NOW);
    expect(r.cancelOrderAfterCommit).toBe(false);
    expect(t.shipments[0]?.status).toBe('cancelled');
    expect(t.order.status).toBe('shipped');
  });

  it('works for a job without a shipment', async () => {
    const t = build({ orderStatus: 'packed' });
    await t.svc.apply(t.tx, { orderId: 'o1', shipmentId: null }, 'picked_up', NOW);
    expect(t.order.status).toBe('shipped');
    expect(t.events).toEqual([]);
  });

  it('every move has an effect that is safe to run from any order status', async () => {
    for (const move of DELIVERY_MOVES) {
      for (const status of ['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']) {
        const t = build({ orderStatus: status, ...withShipment() });
        await expect(t.svc.apply(t.tx, job, move, NOW)).resolves.toBeDefined();
      }
    }
  });
});

describe('OrderSyncService.cancelUndeliverableOrder', () => {
  beforeEach(() => void jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('asks the order service and reports success', async () => {
    const t = build();
    expect(await t.svc.cancelUndeliverableOrder('o1')).toBe(true);
    expect(t.undeliverable).toEqual(['o1']);
  });

  it('reports failure without throwing so the sweep can retry', async () => {
    const t = build({ undeliverableFails: true });
    expect(await t.svc.cancelUndeliverableOrder('o1')).toBe(false);
  });
});
