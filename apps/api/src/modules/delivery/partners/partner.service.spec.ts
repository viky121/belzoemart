import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_DELIVERY_SETTINGS } from '@belzo/shared';
import { PartnerService } from './partner.service';
import { PasswordService } from '../../identity/password.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuditLogService } from '../../admin/audit-log.service';
import type { JobRepository } from '../jobs/job.repository';
import type { DeliverySettingsService } from '../settings/delivery-settings.service';
import type { PartnerTokenService } from './partner-token.service';

const NOW = new Date('2026-10-23T10:00:00Z');
const GOOD = 'Zx9!kLm2pQ';

function row(over: Record<string, any> = {}) {
  return {
    id: 'p1',
    name: 'Ravi Kumar',
    mobile: '9876543210',
    email: null,
    passwordHash: 'HASH',
    mustChangePassword: true,
    vehicleType: null,
    vehicleNumber: null,
    isActive: true,
    isOnline: false,
    lastSeenAt: null,
    lastLat: null,
    lastLng: null,
    maxActiveJobs: 10,
    createdById: 'admin-1',
    createdAt: NOW,
    updatedAt: NOW,
    zones: [{ zoneId: 'z1' }],
    ...over,
  };
}

function build(opts: { existing?: ReturnType<typeof row> | null; zoneCount?: number; partners?: ReturnType<typeof row>[]; activeCounts?: Record<string, number>; zonePincode?: { zoneId: string } | null } = {}) {
  const store = { current: opts.existing === undefined ? row() : opts.existing };
  const calls: Record<string, any[]> = { create: [], update: [], updateMany: [], audit: [], revokeAll: [], tx: [] };
  const prisma: any = {
    deliveryPartner: {
      findUnique: async ({ where }: any) => (where.mobile ? (store.current && store.current.mobile === where.mobile ? store.current : null) : store.current),
      create: async (args: any) => {
        calls.create!.push(args);
        return row({ ...args.data, id: 'new1', zones: args.data.zones.create });
      },
      update: async (args: any) => {
        calls.update!.push(args);
        return { ...(store.current ?? row()), ...args.data, zones: store.current?.zones ?? [] };
      },
      updateMany: async (args: any) => {
        calls.updateMany!.push(args);
        return { count: 3 };
      },
      findMany: async () => opts.partners ?? [],
      count: async () => (opts.partners ?? []).length,
    },
    deliveryZone: { count: async () => opts.zoneCount ?? 0 },
    deliveryZonePincode: { findUnique: async () => opts.zonePincode ?? null },
    deliveryPartnerZone: {
      deleteMany: async (a: any) => void calls.tx!.push(['deleteMany', a]),
      createMany: async (a: any) => void calls.tx!.push(['createMany', a]),
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  const passwords = new PasswordService();
  const audit = { record: async (...a: any[]) => void calls.audit!.push(a) } as unknown as AuditLogService;
  const tokens = { revokeAllFor: async (id: string) => void calls.revokeAll!.push(id) } as unknown as PartnerTokenService;
  const jobs = {
    countActiveForPartner: async (_db: unknown, id: string) => opts.activeCounts?.[id] ?? 0,
    countActiveByPartner: async () => new Map(Object.entries(opts.activeCounts ?? {})),
  } as unknown as JobRepository;
  const settings = { get: async () => ({ ...DEFAULT_DELIVERY_SETTINGS, defaultMaxActiveJobs: 7 }) } as unknown as DeliverySettingsService;
  const service = new PartnerService(prisma as PrismaService, passwords, audit, tokens, jobs, settings);
  return { service, calls, store, passwords };
}

describe('PartnerService.create', () => {
  const input = { name: 'Ravi Kumar', mobile: '9876543210', password: GOOD };

  it('creates a partner with a hashed password, must-change flag and the default capacity', async () => {
    const { service, calls, passwords } = build({ existing: null });
    const view = await service.create('admin-1', input);
    const data = calls.create![0].data;
    expect(data.mustChangePassword).toBe(true);
    expect(data.maxActiveJobs).toBe(7);
    expect(data.createdById).toBe('admin-1');
    expect(data.passwordHash).not.toBe(GOOD);
    expect(await passwords.verify(data.passwordHash, GOOD)).toBe(true);
    expect(view.id).toBe('new1');
    expect(JSON.stringify(view)).not.toContain('passwordHash');
  });

  it('refuses a mobile that is already used', async () => {
    const { service } = build();
    await expect(service.create('a', input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses unknown zones', async () => {
    const { service } = build({ existing: null, zoneCount: 1 });
    await expect(service.create('a', { ...input, zoneIds: ['3f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c', '4f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes an audit entry without the password or hash', async () => {
    const { service, calls } = build({ existing: null });
    await service.create('admin-1', input);
    const [actor, action, target, , after] = calls.audit![0];
    expect(actor).toBe('admin-1');
    expect(action).toBe('delivery.partner.create');
    expect(target).toBe('new1');
    expect(JSON.stringify(after)).not.toMatch(/passwordHash|HASH|Zx9/);
  });
});

describe('PartnerService changes', () => {
  it('replaces the zones when zoneIds is given and audits before and after', async () => {
    const { service, calls } = build({ zoneCount: 2 });
    await service.update('admin-1', 'p1', { name: 'Ravi K', zoneIds: ['3f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c', '4f1c2a64-7b1e-4c52-9f0a-1d2e3f4a5b6c'] });
    expect(calls.tx!.map((t) => t[0])).toEqual(['deleteMany', 'createMany']);
    expect(calls.update![0].data).toEqual({ name: 'Ravi K' });
    expect(calls.audit![0][1]).toBe('delivery.partner.update');
  });

  it('answers 404 for a partner that does not exist', async () => {
    const { service } = build({ existing: null });
    await expect(service.update('a', 'missing', { name: 'X Y' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deactivating takes the partner offline and signs them out everywhere', async () => {
    const { service, calls } = build();
    const view = await service.setActive('admin-1', 'p1', false);
    expect(calls.update![0].data).toEqual({ isActive: false, isOnline: false });
    expect(calls.revokeAll).toEqual(['p1']);
    expect(view.isActive).toBe(false);
    expect(calls.audit![0][1]).toBe('delivery.partner.deactivate');
  });

  it('reactivating does not touch sessions', async () => {
    const { service, calls } = build({ existing: row({ isActive: false }) });
    await service.setActive('admin-1', 'p1', true);
    expect(calls.update![0].data).toEqual({ isActive: true });
    expect(calls.revokeAll).toEqual([]);
  });

  it('a password reset forces a change, signs the partner out and never audits the password', async () => {
    const { service, calls } = build();
    await service.resetPassword('admin-1', 'p1', GOOD);
    expect(calls.update![0].data.mustChangePassword).toBe(true);
    expect(calls.update![0].data.passwordHash).not.toBe(GOOD);
    expect(calls.revokeAll).toEqual(['p1']);
    expect(JSON.stringify(calls.audit)).not.toContain(GOOD);
  });

  it('a password reset refuses a weak password or one holding the mobile number', async () => {
    const { service, calls } = build();
    await expect(service.resetPassword('a', 'p1', 'password')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resetPassword('a', 'p1', 'Ab@87654321x')).rejects.toBeInstanceOf(BadRequestException);
    expect(calls.update).toHaveLength(0);
  });
});

describe('PartnerService lists and suggestions', () => {
  const mk = (id: string, name: string, over: Record<string, any> = {}) => row({ id, name, mobile: `98765432${id.slice(-2).padStart(2, '0')}`, zones: [], ...over });

  it('lists with active job counts', async () => {
    const { service } = build({ partners: [mk('p01', 'A'), mk('p02', 'B')], activeCounts: { p01: 2 } });
    const r = await service.list({ page: 1, pageSize: 20 });
    expect(r.total).toBe(2);
    expect(r.items.map((i) => i.activeJobs)).toEqual([2, 0]);
  });

  it('suggests zone matches first, drops full partners and orders the rest', async () => {
    const { service } = build({
      zonePincode: { zoneId: 'z1' },
      partners: [
        mk('p01', 'Zed', { zones: [{ zoneId: 'z1' }] }),
        mk('p02', 'Amit', { isOnline: true }),
        mk('p03', 'Full', { zones: [{ zoneId: 'z1' }], maxActiveJobs: 2 }),
        mk('p04', 'Online match', { zones: [{ zoneId: 'z1' }], isOnline: true }),
      ],
      activeCounts: { p03: 2 },
    });
    const s = await service.suggestFor('411001');
    expect(s.map((x) => x.name)).toEqual(['Online match', 'Zed', 'Amit']);
    expect(s.map((x) => x.zoneMatch)).toEqual([true, true, false]);
  });

  it('suggests without zone ordering when the pincode has no zone', async () => {
    const { service } = build({ zonePincode: null, partners: [mk('p01', 'B'), mk('p02', 'A')] });
    expect((await service.suggestFor('411001')).every((x) => !x.zoneMatch)).toBe(true);
  });
});

describe('PartnerService presence', () => {
  it('goes online and offline', async () => {
    const { service, calls } = build();
    await service.setOnline('p1', true);
    expect(calls.update![0].data.isOnline).toBe(true);
    expect(calls.update![0].data.lastSeenAt).toBeInstanceOf(Date);
  });

  it('heartbeat only updates a partner who is online and stores the last position', async () => {
    const { service, calls } = build();
    await service.heartbeat('p1', { lat: 18.5, lng: 73.8 });
    expect(calls.updateMany![0].where).toEqual({ id: 'p1', isOnline: true });
    expect(calls.updateMany![0].data).toMatchObject({ lastLat: 18.5, lastLng: 73.8 });
    await service.heartbeat('p1');
    expect(calls.updateMany![1].data.lastLat).toBeUndefined();
  });

  it('marks partners offline when not heard from for the set number of minutes', async () => {
    const { service, calls } = build();
    const n = await service.markStaleOffline(NOW, 30);
    expect(n).toBe(3);
    expect(calls.updateMany![0].where.isOnline).toBe(true);
    expect(NOW.getTime() - calls.updateMany![0].where.lastSeenAt.lt.getTime()).toBe(30 * 60_000);
    expect(calls.updateMany![0].data).toEqual({ isOnline: false });
  });
});
