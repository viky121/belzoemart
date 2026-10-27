import { ALL_PERMISSION_KEYS } from '@belzo/shared';
import { RbacFakeDb } from '../../modules/identity/testing/rbac-fake-db';
import { AdminAccessService, accessCan, assertAccessCan, type AdminAccess } from './admin-access.service';

function setup() {
  const db = new RbacFakeDb();
  db.addRole('super_admin', { isSystem: true });
  db.addRole('accountant', { permissions: ['reports.view', 'reports.profit', 'orders.view'] });
  db.addRole('support', { permissions: ['customers.view', 'old.coarse.key'] });
  return { db, svc: new AdminAccessService(db.prisma) };
}

describe('AdminAccessService', () => {
  it('works out the permissions from the staff type held', async () => {
    const { db, svc } = setup();
    const a = db.addAdmin('a@x.in', ['accountant']);
    const got = await svc.get(a.id);
    expect(got).toMatchObject({ adminId: a.id, status: 'active', roles: ['accountant'], isSuperAdmin: false });
    expect([...got!.permissions].sort()).toEqual(['orders.view', 'reports.profit', 'reports.view']);
  });

  it('ignores permission rows that are not in the catalogue any more', async () => {
    const { db, svc } = setup();
    const a = db.addAdmin('s@x.in', ['support']);
    expect([...(await svc.get(a.id))!.permissions]).toEqual(['customers.view']);
  });

  it('adds up the permissions when an older account holds several types', async () => {
    const { db, svc } = setup();
    const a = db.addAdmin('m@x.in', ['accountant', 'support']);
    expect([...(await svc.get(a.id))!.permissions].sort()).toEqual(['customers.view', 'orders.view', 'reports.profit', 'reports.view']);
  });

  it('gives the Super Admin every permission', async () => {
    const { db, svc } = setup();
    const a = db.addAdmin('root@x.in', ['super_admin']);
    const got = (await svc.get(a.id))!;
    expect(got.isSuperAdmin).toBe(true);
    expect([...got.permissions].sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it('reports a switched-off admin as disabled, and an unknown admin as null', async () => {
    const { db, svc } = setup();
    const a = db.addAdmin('off@x.in', ['accountant'], { status: 'disabled' });
    expect((await svc.get(a.id))!.status).toBe('disabled');
    expect(await svc.get('no-such-id')).toBeNull();
  });

  it('a person with no staff type can do nothing', async () => {
    const { db, svc } = setup();
    const a = db.addAdmin('none@x.in', []);
    expect([...(await svc.get(a.id))!.permissions]).toEqual([]);
  });

  describe('short cache', () => {
    it('answers repeat requests from memory, then asks again after the cache time', async () => {
      const { db, svc } = setup();
      const a = db.addAdmin('c@x.in', ['accountant']);
      await svc.get(a.id, 1_000);
      const after1 = db.queries;
      await svc.get(a.id, 1_000 + 5_000);
      expect(db.queries).toBe(after1);
      await svc.get(a.id, 1_000 + AdminAccessService.TTL_MS + 1);
      expect(db.queries).toBeGreaterThan(after1);
    });

    it('a change applies on the very next request once the cache is cleared', async () => {
      const { db, svc } = setup();
      const a = db.addAdmin('d@x.in', ['accountant']);
      expect((await svc.get(a.id, 1_000))!.status).toBe('active');
      a.status = 'disabled';
      expect((await svc.get(a.id, 1_500))!.status).toBe('active'); // still cached
      svc.invalidate(a.id);
      expect((await svc.get(a.id, 1_600))!.status).toBe('disabled');
    });

    it('invalidate() with no id forgets everyone', async () => {
      const { db, svc } = setup();
      const a = db.addAdmin('e@x.in', ['accountant']);
      const b = db.addAdmin('f@x.in', ['support']);
      await svc.get(a.id, 1);
      await svc.get(b.id, 1);
      const q = db.queries;
      svc.invalidate();
      await svc.get(a.id, 2);
      await svc.get(b.id, 2);
      expect(db.queries).toBeGreaterThan(q);
    });
  });
});

describe('accessCan / assertAccessCan', () => {
  const base: AdminAccess = { adminId: 'a', status: 'active', roles: ['x'], isSuperAdmin: false, permissions: new Set(['reports.export']) };

  it('is true only for a held permission, or for the Super Admin', () => {
    expect(accessCan(base, 'reports.export')).toBe(true);
    expect(accessCan(base, 'reports.profit')).toBe(false);
    expect(accessCan({ ...base, isSuperAdmin: true }, 'reports.profit')).toBe(true);
  });

  it('is false for a missing or switched-off admin, even a Super Admin', () => {
    expect(accessCan(undefined, 'reports.export')).toBe(false);
    expect(accessCan({ ...base, status: 'disabled' }, 'reports.export')).toBe(false);
    expect(accessCan({ ...base, status: 'disabled', isSuperAdmin: true }, 'reports.export')).toBe(false);
  });

  it('assert throws 403 with a plain message', () => {
    expect(() => assertAccessCan(base, 'reports.profit')).toThrow(/do not have permission/);
    expect(() => assertAccessCan(base, 'reports.export')).not.toThrow();
  });
});
