import { ALL_PERMISSION_KEYS, ROLE_TEMPLATES } from '@belzo/shared';
import { AdminAccessService } from '../../common/auth/admin-access.service';
import { RbacBootstrapService, TEMPLATES_MARKER } from './rbac-bootstrap.service';
import { RbacFakeDb } from './testing/rbac-fake-db';

function setup(prepare?: (db: RbacFakeDb) => void) {
  const db = new RbacFakeDb();
  prepare?.(db);
  const access = new AdminAccessService(db.prisma);
  const invalidate = jest.spyOn(access, 'invalidate');
  return { db, svc: new RbacBootstrapService(db.prisma, access), invalidate };
}

describe('RbacBootstrapService', () => {
  it('on a fresh database: makes every permission, the Super Admin type and the ready-made types', async () => {
    const { db, svc, invalidate } = setup();
    expect(await svc.run()).toEqual({ templatesCreated: true });
    expect(db.permissions.map((p) => p.key).sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    expect(db.roles.find((r) => r.name === 'super_admin')).toMatchObject({ isSystem: true });
    for (const t of ROLE_TEMPLATES) expect(db.roleKeys(t.name)).toEqual([...t.permissions].sort());
    expect(db.settings.has(TEMPLATES_MARKER)).toBe(true);
    expect(invalidate).toHaveBeenCalled();
  });

  it('gives no ready-made type the staff permission', async () => {
    const { db, svc } = setup();
    await svc.run();
    for (const t of ROLE_TEMPLATES) expect(db.roleKeys(t.name)).not.toContain('staff.manage');
  });

  it('moves the five older types from their coarse permissions to the new ones, once', async () => {
    const { db, svc } = setup((d) => {
      d.addRole('super_admin');
      d.addRole('order_manager', { description: 'order_manager', permissions: ['order.read', 'order.write', 'customer.read'] });
      d.addRole('support', { permissions: ['order.read', 'customer.read'] });
    });
    await svc.run();
    expect(db.roleKeys('order_manager')).toEqual([...ROLE_TEMPLATES.find((t) => t.name === 'order_manager')!.permissions].sort());
    expect(db.roleKeys('support')).toEqual(['customers.view', 'reviews.moderate']);
    // the old keys are gone and the old super_admin row is now protected
    expect(db.permissions.some((p) => p.key === 'order.read')).toBe(false);
    expect(db.roles.find((r) => r.name === 'super_admin')!.isSystem).toBe(true);
    // the description of an old type is filled in
    expect(db.roles.find((r) => r.name === 'order_manager')!.description).toMatch(/Orders, returns/);
  });

  it('keeps existing staff on their type', async () => {
    const { db, svc } = setup((d) => {
      d.addRole('super_admin');
      d.addRole('marketing', { permissions: ['marketing.write'] });
      d.addAdmin('m@x.in', ['marketing']);
    });
    await svc.run();
    const link = db.adminRoles.find((l) => l.roleId === db.roles.find((r) => r.name === 'marketing')!.id);
    expect(link).toBeTruthy();
    expect(db.roleKeys('marketing')).toContain('coupons.edit');
  });

  it('on later starts never undoes an edit, a rename or a deletion', async () => {
    const { db, svc } = setup();
    await svc.run();
    // the owner edits Manager, renames Support and deletes Accountant
    const manager = db.roles.find((r) => r.name === 'manager')!;
    db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== manager.id);
    db.roles.find((r) => r.name === 'support')!.name = 'Help desk';
    const acc = db.roles.find((r) => r.name === 'accountant')!;
    db.roles = db.roles.filter((r) => r.id !== acc.id);
    db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== acc.id);

    expect(await svc.run()).toEqual({ templatesCreated: false });
    expect(db.roleKeys('manager')).toEqual([]);
    expect(db.roles.some((r) => r.name === 'support')).toBe(false);
    expect(db.roles.some((r) => r.name === 'Help desk')).toBe(true);
    expect(db.roles.some((r) => r.name === 'accountant')).toBe(false);
  });

  it('on later starts still adds a permission that is new in the code and refreshes its text', async () => {
    const { db, svc } = setup();
    await svc.run();
    const lost = db.permissions.find((p) => p.key === 'media.manage')!;
    db.permissions = db.permissions.filter((p) => p !== lost);
    db.rolePermissions = db.rolePermissions.filter((rp) => rp.permissionId !== lost.id);
    db.permissions.find((p) => p.key === 'orders.view')!.description = 'stale text';
    await svc.run();
    expect(db.permissions.some((p) => p.key === 'media.manage')).toBe(true);
    expect(db.permissions.find((p) => p.key === 'orders.view')!.description).not.toBe('stale text');
  });

  it('is safe to run twice in a row', async () => {
    const { db, svc } = setup();
    await svc.run();
    const roles = db.roles.length;
    const grants = db.rolePermissions.length;
    await svc.run();
    expect(db.roles.length).toBe(roles);
    expect(db.rolePermissions.length).toBe(grants);
  });

  it('never stops the app from starting when something fails', async () => {
    const { svc, db } = setup();
    jest.spyOn(db.prisma.permission, 'findMany').mockRejectedValue(new Error('db down'));
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });
});
