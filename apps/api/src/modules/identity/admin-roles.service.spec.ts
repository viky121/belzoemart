import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSION_KEYS, PERMISSION_DEFS } from '@belzo/shared';
import { AdminAccessService } from '../../common/auth/admin-access.service';
import type { AuditLogService } from '../admin/audit-log.service';
import { AdminRolesService } from './admin-roles.service';
import { RbacFakeDb } from './testing/rbac-fake-db';

function setup() {
  const db = new RbacFakeDb();
  for (const def of PERMISSION_DEFS) db.permissions.push({ id: `p-${def.key}`, key: def.key, description: def.help });
  const root = db.addRole('super_admin', { isSystem: true });
  const access = new AdminAccessService(db.prisma);
  const invalidate = jest.spyOn(access, 'invalidate');
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditLogService;
  const svc = new AdminRolesService(db.prisma, access, audit);
  return { db, svc, root, invalidate, audit: audit as unknown as { record: jest.Mock } };
}

describe('AdminRolesService', () => {
  it('lists the Super Admin type first, with every permission and the staff count', async () => {
    const { db, svc } = setup();
    db.addRole('support', { permissions: ['customers.view'] });
    db.addAdmin('a@x.in', ['support']);
    const list = await svc.list();
    expect(list.map((r) => r.name)).toEqual(['super_admin', 'support']);
    expect(list[0]).toMatchObject({ isSystem: true });
    expect(list[0]!.permissions).toEqual([...ALL_PERMISSION_KEYS]);
    expect(list[1]).toMatchObject({ staffCount: 1, permissions: ['customers.view'] });
  });

  describe('create', () => {
    it('makes a type with the ticked permissions plus what they need, in catalogue order', async () => {
      const { db, svc, invalidate, audit } = setup();
      const made = await svc.create('boss', { name: '  Store   Manager ', description: 'Runs the floor', permissions: ['orders.manage', 'products.bulk'] });
      expect(made).toMatchObject({ name: 'Store Manager', description: 'Runs the floor', isSystem: false, staffCount: 0 });
      expect(made.permissions).toEqual(['products.view', 'products.edit', 'products.bulk', 'orders.view', 'orders.manage']);
      expect(db.roleKeys('Store Manager')).toEqual([...made.permissions].sort());
      expect(invalidate).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith('boss', 'role.create', made.id, undefined, expect.objectContaining({ name: 'Store Manager' }));
    });

    it('can make a type with no permissions yet', async () => {
      const { svc } = setup();
      expect((await svc.create('boss', { name: 'Trainee', permissions: [] })).permissions).toEqual([]);
    });

    it('refuses a bad or reserved name', async () => {
      const { svc } = setup();
      await expect(svc.create('boss', { name: 'x', permissions: [] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create('boss', { name: 'Super Admin', permissions: [] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.create('boss', { name: '<b>', permissions: [] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a name that already exists, ignoring case, spaces and dashes', async () => {
      const { db, svc } = setup();
      db.addRole('order_manager');
      await expect(svc.create('boss', { name: 'Order Manager', permissions: [] })).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.create('boss', { name: 'ORDER-manager', permissions: [] })).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an unknown permission instead of silently granting nothing', async () => {
      const { svc } = setup();
      await expect(svc.create('boss', { name: 'Tester', permissions: ['orders.veiw'] })).rejects.toThrow(/Unknown permission/);
    });

    it('never gives staff.manage to a type (no one can raise their own access)', async () => {
      const { svc, db } = setup();
      await expect(svc.create('boss', { name: 'Sneaky', permissions: ['staff.manage'] })).rejects.toThrow(/kept for the Super Admin/);
      expect(db.roles.some((r) => r.name === 'Sneaky')).toBe(false);
    });
  });

  describe('update', () => {
    it('changes name, description and permissions, replacing the old permissions', async () => {
      const { db, svc, audit } = setup();
      const r = db.addRole('support', { permissions: ['customers.view', 'reviews.moderate'] });
      const out = await svc.update('boss', r.id, { name: 'Help desk', description: 'Answers customers', permissions: ['orders.view'] });
      expect(out).toMatchObject({ name: 'Help desk', description: 'Answers customers', permissions: ['orders.view'] });
      expect(db.roleKeys('Help desk')).toEqual(['orders.view']);
      expect(audit.record).toHaveBeenCalledWith('boss', 'role.update', r.id, expect.anything(), expect.anything());
    });

    it('applies on the next request: clears the access cache', async () => {
      const { db, svc, invalidate } = setup();
      const r = db.addRole('support');
      await svc.update('boss', r.id, { permissions: ['customers.view'] });
      expect(invalidate).toHaveBeenCalled();
    });

    it('may keep its own name, but not take another type\u2019s name', async () => {
      const { db, svc } = setup();
      const a = db.addRole('Alpha');
      db.addRole('Beta');
      await expect(svc.update('boss', a.id, { name: 'Alpha', description: 'same name' })).resolves.toMatchObject({ name: 'Alpha' });
      await expect(svc.update('boss', a.id, { name: 'beta' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('cannot touch the Super Admin type', async () => {
      const { svc, root } = setup();
      await expect(svc.update('boss', root.id, { permissions: [] })).rejects.toThrow(/Super Admin type cannot be changed/);
      await expect(svc.update('boss', root.id, { name: 'Boss' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 404 for a type that does not exist', async () => {
      const { svc } = setup();
      await expect(svc.update('boss', 'nope', { name: 'Whatever' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a type nobody holds', async () => {
      const { db, svc, audit } = setup();
      const r = db.addRole('Temp', { permissions: ['customers.view'] });
      await svc.remove('boss', r.id);
      expect(db.roles.find((x) => x.id === r.id)).toBeUndefined();
      expect(audit.record).toHaveBeenCalledWith('boss', 'role.delete', r.id, expect.objectContaining({ name: 'Temp' }));
    });

    it('refuses while staff hold it, saying how many', async () => {
      const { db, svc } = setup();
      const r = db.addRole('Busy');
      db.addAdmin('a@x.in', ['Busy']);
      db.addAdmin('b@x.in', ['Busy']);
      await expect(svc.remove('boss', r.id)).rejects.toThrow(/2 staff members have this type/);
      expect(db.roles.some((x) => x.id === r.id)).toBe(true);
    });

    it('refuses to delete the Super Admin type', async () => {
      const { svc, root } = setup();
      await expect(svc.remove('boss', root.id)).rejects.toThrow(/cannot be deleted/);
    });
  });
});
