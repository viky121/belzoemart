import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminAccessService } from '../../common/auth/admin-access.service';
import type { AuditLogService } from '../admin/audit-log.service';
import { AdminUserService, generateBase32Secret } from './admin-user.service';
import type { PasswordService } from './password.service';
import { RbacFakeDb } from './testing/rbac-fake-db';
import type { TokenService } from './token.service';

function setup() {
  const db = new RbacFakeDb();
  const root = db.addRole('super_admin', { isSystem: true });
  const manager = db.addRole('manager', { permissions: ['orders.view'] });
  const support = db.addRole('support', { permissions: ['customers.view'] });
  const boss = db.addAdmin('boss@x.in', ['super_admin'], { name: 'Boss' });
  const access = new AdminAccessService(db.prisma);
  const invalidate = jest.spyOn(access, 'invalidate');
  const revoked: string[] = [];
  const tokens = { revokeAllFor: jest.fn(async (id: string) => void revoked.push(id)) } as unknown as TokenService;
  const passwords = { hash: jest.fn(async (p: string) => `hash:${p}`) } as unknown as PasswordService;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditLogService;
  const svc = new AdminUserService(db.prisma, passwords, tokens, access, audit);
  return { db, svc, root, manager, support, boss, invalidate, revoked, audit: audit as unknown as { record: jest.Mock } };
}

describe('AdminUserService', () => {
  it('lists staff with their type, putting the Super Admin type first when several are held', async () => {
    const { db, svc } = setup();
    const m = db.addAdmin('m@x.in', ['manager', 'super_admin']);
    const list = await svc.list();
    expect(list.find((s) => s.id === m.id)).toMatchObject({ role: { name: 'super_admin' }, roleCount: 2, isSuperAdmin: true });
    expect(list.find((s) => s.email === 'boss@x.in')).toMatchObject({ isSuperAdmin: true, status: 'active', mfaEnabled: false });
  });

  describe('create', () => {
    it('makes a staff member with one type and a hashed password (never returned)', async () => {
      const { svc, manager, db, audit } = setup();
      const made = await svc.create('boss', { email: ' Ravi@Shop.in ', name: ' Ravi ', password: 'Belzo@2026', roleId: manager.id });
      expect(made).toMatchObject({ email: 'ravi@shop.in', name: 'Ravi', status: 'active', role: { name: 'manager' }, roleCount: 1, isSuperAdmin: false });
      expect(JSON.stringify(made)).not.toMatch(/hash|Belzo@2026/);
      expect(db.admins.find((a) => a.email === 'ravi@shop.in')!.passwordHash).toBe('hash:Belzo@2026');
      expect(audit.record).toHaveBeenCalledWith('boss', 'staff.create', made.id, undefined, { email: 'ravi@shop.in', role: 'manager' });
    });

    it('refuses a second staff member with the same email', async () => {
      const { svc, manager } = setup();
      await expect(svc.create('boss', { email: 'BOSS@x.in', name: 'Dup', password: 'Belzo@2026', roleId: manager.id })).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an unknown type and the Super Admin type', async () => {
      const { svc, root } = setup();
      await expect(svc.create('boss', { email: 'a@x.in', name: 'A', password: 'Belzo@2026', roleId: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.create('boss', { email: 'a@x.in', name: 'A', password: 'Belzo@2026', roleId: root.id })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('moves a person to another type, leaving exactly one', async () => {
      const { db, svc, manager, support, invalidate } = setup();
      const a = db.addAdmin('a@x.in', ['manager', 'support']);
      const out = await svc.update('boss', a.id, { roleId: support.id });
      expect(out.role?.name).toBe('support');
      expect(out.roleCount).toBe(1);
      expect(db.adminRoles.filter((r) => r.adminUserId === a.id).map((r) => r.roleId)).toEqual([support.id]);
      expect(invalidate).toHaveBeenCalledWith(a.id);
      expect(manager.id).not.toBe(support.id);
    });

    it('switching someone off signs them out everywhere and applies at once', async () => {
      const { db, svc, revoked, invalidate } = setup();
      const a = db.addAdmin('a@x.in', ['manager']);
      const out = await svc.update('boss', a.id, { status: 'disabled' });
      expect(out.status).toBe('disabled');
      expect(revoked).toEqual([a.id]);
      expect(invalidate).toHaveBeenCalledWith(a.id);
      // switching back on does not sign anyone out
      await svc.update('boss', a.id, { status: 'active' });
      expect(revoked).toEqual([a.id]);
    });

    it('changes the name', async () => {
      const { db, svc } = setup();
      const a = db.addAdmin('a@x.in', ['manager']);
      expect((await svc.update('boss', a.id, { name: '  New Name ' })).name).toBe('New Name');
    });

    it('you cannot switch yourself off or change your own type, but you can rename yourself', async () => {
      const { svc, boss, support } = setup();
      await expect(svc.update(boss.id, boss.id, { status: 'disabled' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update(boss.id, boss.id, { roleId: support.id })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.update(boss.id, boss.id, { name: 'Big Boss' })).resolves.toMatchObject({ name: 'Big Boss' });
    });

    it('the last active Super Admin cannot be switched off or moved by another admin', async () => {
      const { db, svc, support } = setup();
      const other = db.addAdmin('other@x.in', ['super_admin']);
      // two active Super Admins: fine to switch one off
      await expect(svc.update(other.id, db.admins[0]!.id, { status: 'disabled' })).resolves.toMatchObject({ status: 'disabled' });
      // now `other` is the last active one
      const helper = db.addAdmin('helper@x.in', ['manager']);
      await expect(svc.update(helper.id, other.id, { status: 'disabled' })).rejects.toThrow(/last active Super Admin/);
      await expect(svc.update(helper.id, other.id, { roleId: support.id })).rejects.toThrow(/last active Super Admin/);
    });

    it('the Super Admin type cannot be handed to someone from here', async () => {
      const { db, svc, root } = setup();
      const a = db.addAdmin('a@x.in', ['manager']);
      await expect(svc.update('boss', a.id, { roleId: root.id })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 404 for an unknown staff member', async () => {
      const { svc } = setup();
      await expect(svc.update('boss', 'nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('records before and after in the audit log', async () => {
      const { db, svc, audit, support } = setup();
      const a = db.addAdmin('a@x.in', ['manager']);
      await svc.update('boss', a.id, { roleId: support.id });
      expect(audit.record).toHaveBeenCalledWith('boss', 'staff.update', a.id, expect.objectContaining({ role: 'manager' }), expect.objectContaining({ role: 'support' }));
    });
  });

  describe('password and two-step login', () => {
    it('a new password is hashed, signs the person out everywhere and is never written to the audit log', async () => {
      const { db, svc, revoked, audit } = setup();
      const a = db.addAdmin('a@x.in', ['manager']);
      await svc.resetPassword('boss', a.id, 'New@Pass1');
      expect(db.admins.find((x) => x.id === a.id)!.passwordHash).toBe('hash:New@Pass1');
      expect(revoked).toEqual([a.id]);
      expect(JSON.stringify(audit.record.mock.calls)).not.toContain('New@Pass1');
    });

    it('turns two-step login on (secret shown once) and off', async () => {
      const { db, svc } = setup();
      const a = db.addAdmin('a@x.in', ['manager']);
      const { otpauthUrl } = await svc.enableMfa('boss', a.id);
      expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\/Belzo%20eMart%3Aa%40x\.in\?secret=[A-Z2-7]{32}&issuer=/);
      expect(db.admins.find((x) => x.id === a.id)).toMatchObject({ mfaEnabled: true });
      await svc.disableMfa('boss', a.id);
      expect(db.admins.find((x) => x.id === a.id)).toMatchObject({ mfaEnabled: false, mfaSecret: null });
    });

    it('answers 404 when the person is not found', async () => {
      const { svc } = setup();
      await expect(svc.resetPassword('boss', 'nope', 'New@Pass1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.enableMfa('boss', 'nope')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.disableMfa('boss', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('generateBase32Secret', () => {
  it('makes a 32 character base32 secret that differs each time', () => {
    const a = generateBase32Secret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateBase32Secret()).not.toBe(a);
  });
});
