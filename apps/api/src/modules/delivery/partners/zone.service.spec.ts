import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ZoneService } from './zone.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditLogService } from '../../admin/audit-log.service';

const Z1 = '3f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c';
const Z2 = '4f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c';

function build(opts: { zones?: Record<string, { name: string; pincodes: string[] }>; clashes?: { pincode: string; zone: { name: string } }[]; partnerExists?: boolean; zoneCount?: number } = {}) {
  const zones = opts.zones ?? { [Z1]: { name: 'Kothrud', pincodes: ['411038'] } };
  const calls: any[] = [];
  const audits: any[][] = [];
  const prisma: any = {
    deliveryZone: {
      findUnique: async ({ where, include }: any) => {
        if (where.name) return Object.values(zones).find((z) => z.name === where.name) ? { id: 'x' } : null;
        const z = zones[where.id];
        if (!z) return null;
        return include
          ? { id: where.id, name: z.name, isActive: true, pincodes: z.pincodes.map((pincode) => ({ pincode })), _count: { partners: 2 } }
          : { id: where.id };
      },
      create: async ({ data }: any) => {
        zones['new-zone'] = { name: data.name, pincodes: [] };
        return { id: 'new-zone', ...data };
      },
      update: async (a: any) => void calls.push(['zone.update', a]),
      delete: async (a: any) => void calls.push(['zone.delete', a]),
      count: async () => opts.zoneCount ?? 0,
      findMany: async () => [{ id: Z1, name: 'Kothrud', isActive: true, _count: { pincodes: 1, partners: 2 } }],
    },
    deliveryZonePincode: {
      findMany: async () => opts.clashes ?? [],
      deleteMany: async (a: any) => (calls.push(['pin.deleteMany', a]), 'delete-op'),
      createMany: async (a: any) => (calls.push(['pin.createMany', a]), 'create-op'),
    },
    deliveryPartner: { findUnique: async () => (opts.partnerExists === false ? null : { id: 'p1' }) },
    deliveryPartnerZone: {
      deleteMany: async (a: any) => (calls.push(['pz.deleteMany', a]), 'd'),
      createMany: async (a: any) => (calls.push(['pz.createMany', a]), 'c'),
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };
  const audit = { record: async (...a: any[]) => void audits.push(a) } as unknown as AuditLogService;
  return { service: new ZoneService(prisma as PrismaService, audit), calls, audits };
}

describe('ZoneService', () => {
  it('lists zones with counts', async () => {
    const { service } = build();
    expect(await service.list()).toEqual([{ id: Z1, name: 'Kothrud', isActive: true, pincodeCount: 1, partnerCount: 2 }]);
  });

  it('creates a zone and audits it; refuses a duplicate name', async () => {
    const { service, audits } = build();
    await service.create('admin-1', { name: 'Baner' });
    expect(audits[0]?.[1]).toBe('delivery.zone.create');
    await expect(service.create('admin-1', { name: 'Kothrud' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('answers 404 for a zone that does not exist', async () => {
    const { service } = build();
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('a', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaces pincodes, removing duplicates', async () => {
    const { service, calls, audits } = build();
    await service.setPincodes('admin-1', Z1, ['411038', '411052', '411038']);
    const created = calls.find((c) => c[0] === 'pin.createMany')?.[1].data;
    expect(created).toEqual([
      { zoneId: Z1, pincode: '411038' },
      { zoneId: Z1, pincode: '411052' },
    ]);
    expect(calls[0]?.[0]).toBe('pin.deleteMany');
    expect(audits[0]?.[4]).toEqual({ count: 2 });
  });

  it('lists the clashes when a pincode already belongs to another zone, and changes nothing', async () => {
    const { service, calls } = build({ clashes: [{ pincode: '411052', zone: { name: 'Baner' } }] });
    const e = await service.setPincodes('a', Z1, ['411052']).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ConflictException);
    expect((e as Error).message).toContain('411052 (Baner)');
    expect(calls).toHaveLength(0);
  });

  it('replaces the zones of a partner and checks they exist', async () => {
    const { service, calls } = build({ zoneCount: 2 });
    expect(await service.setPartnerZones('a', 'p1', [Z1, Z2, Z1])).toEqual([Z1, Z2]);
    expect(calls.map((c) => c[0])).toEqual(['pz.deleteMany', 'pz.createMany']);
    const bad = build({ zoneCount: 1 });
    await expect(bad.service.setPartnerZones('a', 'p1', [Z1, Z2])).rejects.toBeInstanceOf(BadRequestException);
    const missing = build({ partnerExists: false });
    await expect(missing.service.setPartnerZones('a', 'nobody', [])).rejects.toBeInstanceOf(NotFoundException);
  });
});
