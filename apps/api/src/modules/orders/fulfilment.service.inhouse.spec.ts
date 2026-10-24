import { FulfilmentService } from './fulfilment.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ShippingProvider } from '../../integrations/shipping/shipping.provider';
import type { SettingsService } from '../admin/settings.service';

/** In-house delivery (U8): fulfilment must leave an order with an active delivery job alone (BR-D59). */
function build(opts: { activeJob?: { shipmentId: string | null } | null; shipment?: Record<string, any> | null }) {
  const calls: string[] = [];
  const prisma = {
    order: { findUnique: async () => ({ id: 'o1', addressId: 'a1', status: 'packed', codFee: 0, grandTotal: 1000, items: [] }), update: async () => ({}) },
    deliveryJob: { findFirst: async () => opts.activeJob ?? null },
    shipment: {
      findUnique: async () => opts.shipment ?? null,
      findFirst: async () => null,
      findMany: async () => (opts.shipment ? [opts.shipment] : []),
      create: async () => {
        calls.push('shipment.create');
        return { id: 'new' };
      },
      update: async ({ data }: any) => void calls.push(`shipment.update:${data.status}`),
    },
    trackingEvent: { create: async ({ data }: any) => void calls.push(`event:${data.status}`), findMany: async () => [] },
    address: { findUnique: async () => ({ pincode: '411001' }) },
    variant: { findMany: async () => [] },
  } as unknown as PrismaService;
  const shipping = {
    kind: 'mock' as const,
    createAwb: async () => (calls.push('createAwb'), { awb: 'AWB', courier: 'Mock' }),
    getTracking: async () => (calls.push('getTracking'), []),
    cancelShipment: async () => void calls.push('cancelShipment'),
    checkServiceability: async () => ({ serviceable: true, codAvailable: true, estimatedDays: 2, shippingCharge: 0 }),
  } as unknown as ShippingProvider;
  const settings = { get: async () => undefined } as unknown as SettingsService;
  return { svc: new FulfilmentService(prisma, shipping, settings), calls };
}

describe('FulfilmentService with an in-house delivery job', () => {
  const inhouse = { id: 's1', orderId: 'o1', provider: 'inhouse', awb: 'DLV-ABCD2345', status: 'packed', createdAt: new Date() };

  it('createShipment returns the job\'s own shipment and creates nothing', async () => {
    const { svc, calls } = build({ activeJob: { shipmentId: 's1' }, shipment: inhouse });
    expect(await svc.createShipment('o1')).toEqual({ shipmentId: 's1', awb: 'DLV-ABCD2345' });
    expect(calls).toEqual([]);
  });

  it('createShipment still makes a shipment when there is no active job', async () => {
    const { svc, calls } = build({ activeJob: null });
    await svc.createShipment('o1');
    expect(calls).toContain('createAwb');
    expect(calls).toContain('shipment.create');
  });

  it('syncTracking does not ask a courier about an in-house shipment', async () => {
    const { svc, calls } = build({ shipment: inhouse });
    await svc.syncTracking('s1');
    expect(calls).toEqual([]);
  });

  it('cancelShipmentsForOrder marks an in-house shipment cancelled without calling a courier', async () => {
    const { svc, calls } = build({ shipment: inhouse });
    await svc.cancelShipmentsForOrder('o1');
    expect(calls).not.toContain('cancelShipment');
    expect(calls).toEqual(['shipment.update:cancelled', 'event:cancelled']);
  });

  it('cancelShipmentsForOrder still cancels a courier shipment with the courier', async () => {
    const { svc, calls } = build({ shipment: { ...inhouse, provider: 'mock', awb: 'MOCKAWB1' } });
    await svc.cancelShipmentsForOrder('o1');
    expect(calls).toContain('cancelShipment');
  });
});
