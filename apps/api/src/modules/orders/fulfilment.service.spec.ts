import { FulfilmentService } from './fulfilment.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ShippingProvider } from '../../integrations/shipping/shipping.provider';
import type { SettingsService } from '../admin/settings.service';

/**
 * Proves the fulfilment shipment weight prefers each variant's real
 * `weightGrams` when set, and falls back to the admin-configurable
 * `shipping.defaultItemWeightGrams` (default 500) when a variant has none —
 * replacing the former flat 500g-per-item assumption.
 */
describe('FulfilmentService.createShipment — weight resolution', () => {
  function build(opts: {
    items: { variantId: string; quantity: number }[];
    variants: { id: string; weightGrams: number }[];
    settingsMap: Record<string, unknown>;
  }) {
    let capturedWeight = -1;
    const prisma = {
      order: {
        findUnique: async () => ({
          id: 'order-1',
          addressId: 'addr-1',
          status: 'confirmed',
          codFee: 0,
          grandTotal: 100000,
          items: opts.items,
        }),
        update: async () => ({}),
      },
      shipment: {
        findFirst: async () => null,
        create: async () => ({ id: 'ship-1' }),
      },
      address: {
        findUnique: async () => ({ id: 'addr-1', pincode: '560100' }),
      },
      variant: {
        findMany: async () => opts.variants,
      },
    } as unknown as PrismaService;

    const shipping = {
      kind: 'mock' as const,
      createAwb: async (req: { weightGrams: number }) => {
        capturedWeight = req.weightGrams;
        return { awb: 'AWB1', courier: 'Mock' };
      },
      checkServiceability: async () => ({ serviceable: true, codAvailable: false, estimatedDays: 3, shippingCharge: 4900 }),
      getTracking: async () => [],
    } as unknown as ShippingProvider;

    const settings = {
      get: async (key: string) => opts.settingsMap[key],
    } as unknown as SettingsService;

    return { svc: new FulfilmentService(prisma, shipping, settings), getWeight: () => capturedWeight };
  }

  it('uses variant.weightGrams × quantity when the variant has a weight set', async () => {
    const { svc, getWeight } = build({
      items: [{ variantId: 'v1', quantity: 2 }],
      variants: [{ id: 'v1', weightGrams: 750 }],
      settingsMap: {},
    });
    await svc.createShipment('order-1');
    expect(getWeight()).toBe(1500); // 750 × 2
  });

  it('falls back to the configured default weight when the variant weight is 0', async () => {
    const { svc, getWeight } = build({
      items: [{ variantId: 'v1', quantity: 3 }],
      variants: [{ id: 'v1', weightGrams: 0 }],
      settingsMap: { 'shipping.defaultItemWeightGrams': 300 },
    });
    await svc.createShipment('order-1');
    expect(getWeight()).toBe(900); // 300 × 3
  });

  it('falls back to 500g per item when the default-weight setting is unset', async () => {
    const { svc, getWeight } = build({
      items: [{ variantId: 'v1', quantity: 2 }],
      variants: [{ id: 'v1', weightGrams: 0 }],
      settingsMap: {},
    });
    await svc.createShipment('order-1');
    expect(getWeight()).toBe(1000); // 500 × 2 default
  });

  it('mixes real and default weights across line items', async () => {
    const { svc, getWeight } = build({
      items: [
        { variantId: 'v1', quantity: 1 },
        { variantId: 'v2', quantity: 2 },
      ],
      variants: [
        { id: 'v1', weightGrams: 800 },
        { id: 'v2', weightGrams: 0 },
      ],
      settingsMap: {},
    });
    await svc.createShipment('order-1');
    expect(getWeight()).toBe(800 + 500 * 2); // 1800
  });
});

/**
 * syncTracking stores only new events, moves the shipment status forward and
 * advances the order through legal transitions only.
 */
describe('FulfilmentService.syncTracking', () => {
  const createdAt = new Date('2025-01-01T09:00:00.000Z');
  const ev = (status: string, description: string, location?: string) => ({
    status,
    description,
    location,
    occurredAt: '2025-01-01T10:00:00.000Z',
  });

  function build(opts: {
    orderStatus: string;
    shipmentStatus?: string;
    updates: ReturnType<typeof ev>[];
    stored?: { status: string; description: string; location: string | null }[];
  }) {
    const created: Record<string, unknown>[] = [];
    const shipmentUpdates: Record<string, unknown>[] = [];
    const orderUpdates: Record<string, unknown>[] = [];
    const ctxs: unknown[] = [];
    const prisma = {
      shipment: {
        findUnique: async () => ({
          id: 'ship-1',
          orderId: 'order-1',
          awb: 'AWB1',
          status: opts.shipmentStatus ?? 'packed',
          createdAt,
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          shipmentUpdates.push(data);
          return {};
        },
      },
      order: {
        findUnique: async () => ({ id: 'order-1', status: opts.orderStatus }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          orderUpdates.push(data);
          return {};
        },
      },
      trackingEvent: {
        findMany: async () => opts.stored ?? [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        },
      },
    } as unknown as PrismaService;
    const shipping = {
      kind: 'mock' as const,
      getTracking: async (_awb: string, ctx: unknown) => {
        ctxs.push(ctx);
        return opts.updates;
      },
    } as unknown as ShippingProvider;
    const svc = new FulfilmentService(prisma, shipping, {} as SettingsService);
    return { svc, created, shipmentUpdates, orderUpdates, ctxs };
  }

  it('passes the order status and shipment creation time to the provider', async () => {
    const { svc, ctxs } = build({ orderStatus: 'packed', updates: [] });
    await svc.syncTracking('ship-1');
    expect(ctxs).toEqual([{ orderStatus: 'packed', since: createdAt.toISOString() }]);
  });

  it('skips events that are already stored', async () => {
    const { svc, created } = build({
      orderStatus: 'packed',
      updates: [ev('packed', 'Shipment packed', 'Warehouse'), ev('shipped', 'Handed to courier', 'Bengaluru')],
      stored: [{ status: 'packed', description: 'Shipment packed', location: 'Warehouse' }],
    });
    await svc.syncTracking('ship-1');
    expect(created.map((c) => c.status)).toEqual(['shipped']);
  });

  it('advances a packed order to out_for_delivery via shipped and updates the shipment', async () => {
    const { svc, shipmentUpdates, orderUpdates } = build({
      orderStatus: 'packed',
      updates: [ev('packed', 'Shipment packed'), ev('shipped', 'Handed to courier'), ev('out_for_delivery', 'Out for delivery')],
    });
    await svc.syncTracking('ship-1');
    expect(shipmentUpdates).toEqual([{ status: 'out_for_delivery' }]);
    expect(orderUpdates).toEqual([{ status: 'out_for_delivery' }]);
  });

  it('does not move a cancelled order', async () => {
    const { svc, orderUpdates } = build({
      orderStatus: 'cancelled',
      updates: [ev('packed', 'Shipment packed'), ev('shipped', 'Handed to courier')],
    });
    await svc.syncTracking('ship-1');
    expect(orderUpdates).toEqual([]);
  });

  it('does not move the shipment backwards', async () => {
    const { svc, shipmentUpdates } = build({
      orderStatus: 'delivered',
      shipmentStatus: 'delivered',
      updates: [ev('packed', 'Shipment packed')],
    });
    await svc.syncTracking('ship-1');
    expect(shipmentUpdates).toEqual([]);
  });
});
