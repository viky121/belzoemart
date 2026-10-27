import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * A small in-memory stand-in for the parts of Prisma the staff and access code uses (roles, permissions,
 * staff, their links and settings). It answers every query with the full shape the services ask for, whatever
 * `select` says, so the tests can read like the real behaviour. Not a general Prisma fake.
 */
export interface FakeRole { id: string; name: string; description: string; isSystem: boolean }
export interface FakePermission { id: string; key: string; description: string }
export interface FakeAdmin {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  status: 'active' | 'disabled';
  createdAt: Date;
}

export class RbacFakeDb {
  roles: FakeRole[] = [];
  permissions: FakePermission[] = [];
  rolePermissions: { roleId: string; permissionId: string }[] = [];
  admins: FakeAdmin[] = [];
  adminRoles: { adminUserId: string; roleId: string }[] = [];
  settings = new Map<string, unknown>();
  queries = 0;

  addRole(name: string, opts: Partial<FakeRole> & { permissions?: string[] } = {}): FakeRole {
    const role: FakeRole = { id: randomUUID(), name, description: opts.description ?? '', isSystem: opts.isSystem ?? false };
    this.roles.push(role);
    for (const key of opts.permissions ?? []) {
      let p = this.permissions.find((x) => x.key === key);
      if (!p) {
        p = { id: randomUUID(), key, description: key };
        this.permissions.push(p);
      }
      this.rolePermissions.push({ roleId: role.id, permissionId: p.id });
    }
    return role;
  }

  addAdmin(email: string, roleNames: string[] = [], opts: Partial<FakeAdmin> = {}): FakeAdmin {
    const admin: FakeAdmin = {
      id: randomUUID(),
      email,
      name: opts.name ?? email.split('@')[0]!,
      passwordHash: opts.passwordHash ?? 'hash',
      mfaSecret: opts.mfaSecret ?? null,
      mfaEnabled: opts.mfaEnabled ?? false,
      status: opts.status ?? 'active',
      createdAt: opts.createdAt ?? new Date(),
    };
    this.admins.push(admin);
    for (const n of roleNames) {
      const role = this.roles.find((r) => r.name === n);
      if (role) this.adminRoles.push({ adminUserId: admin.id, roleId: role.id });
    }
    return admin;
  }

  roleKeys(roleName: string): string[] {
    const role = this.roles.find((r) => r.name === roleName);
    if (!role) return [];
    const ids = new Set(this.rolePermissions.filter((rp) => rp.roleId === role.id).map((rp) => rp.permissionId));
    return this.permissions.filter((p) => ids.has(p.id)).map((p) => p.key).sort();
  }

  private roleShape(r: FakeRole) {
    return {
      ...r,
      permissions: this.rolePermissions
        .filter((rp) => rp.roleId === r.id)
        .map((rp) => ({ permission: { key: this.permissions.find((p) => p.id === rp.permissionId)!.key } })),
      _count: { admins: this.adminRoles.filter((ar) => ar.roleId === r.id).length },
    };
  }

  private adminShape(a: FakeAdmin) {
    return {
      ...a,
      roles: this.adminRoles
        .filter((ar) => ar.adminUserId === a.id)
        .map((ar) => ({ role: this.roleShape(this.roles.find((r) => r.id === ar.roleId)!) })),
    };
  }

  /** The object to pass where a PrismaService is expected. */
  get prisma(): PrismaService {
    const db = this;
    const count = () => void (db.queries += 1);
    const api = {
      role: {
        findMany: async () => (count(), db.roles.map((r) => db.roleShape(r))),
        findUnique: async ({ where }: { where: { id?: string; name?: string } }) => {
          count();
          const r = db.roles.find((x) => (where.id ? x.id === where.id : x.name === where.name));
          return r ? db.roleShape(r) : null;
        },
        create: async ({ data }: { data: { name: string; description?: string; isSystem?: boolean } }) => {
          if (db.roles.some((r) => r.name === data.name)) throw new Error('Unique constraint failed on name');
          const r: FakeRole = { id: randomUUID(), name: data.name, description: data.description ?? '', isSystem: data.isSystem ?? false };
          db.roles.push(r);
          return db.roleShape(r);
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<FakeRole> }) => {
          const r = db.roles.find((x) => x.id === where.id)!;
          Object.assign(r, data);
          return db.roleShape(r);
        },
        delete: async ({ where }: { where: { id: string } }) => {
          db.roles = db.roles.filter((r) => r.id !== where.id);
          db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== where.id);
          db.adminRoles = db.adminRoles.filter((ar) => ar.roleId !== where.id);
        },
      },
      permission: {
        findMany: async (args?: { where?: { key?: { in: string[] } } }) => {
          count();
          const keys = args?.where?.key?.in;
          return db.permissions.filter((p) => !keys || keys.includes(p.key));
        },
        upsert: async ({ where, update, create }: { where: { key: string }; update: Partial<FakePermission>; create: { key: string; description: string } }) => {
          const p = db.permissions.find((x) => x.key === where.key);
          if (p) return Object.assign(p, update);
          const made = { id: randomUUID(), ...create };
          db.permissions.push(made);
          return made;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<FakePermission> }) =>
          Object.assign(db.permissions.find((x) => x.id === where.id)!, data),
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          db.permissions = db.permissions.filter((p) => !where.id.in.includes(p.id));
          db.rolePermissions = db.rolePermissions.filter((rp) => !where.id.in.includes(rp.permissionId));
        },
      },
      rolePermission: {
        deleteMany: async ({ where }: { where: { roleId: string } }) => {
          db.rolePermissions = db.rolePermissions.filter((rp) => rp.roleId !== where.roleId);
        },
        createMany: async ({ data }: { data: { roleId: string; permissionId: string }[] }) => {
          db.rolePermissions.push(...data);
        },
      },
      adminUser: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
          count();
          const a = db.admins.find((x) => (where.id ? x.id === where.id : x.email === where.email));
          return a ? db.adminShape(a) : null;
        },
        findMany: async () => db.admins.map((a) => db.adminShape(a)),
        count: async ({ where }: { where: { id?: { not: string } } }) =>
          db.admins.filter((a) => a.status === 'active' && a.id !== where.id?.not && db.adminShape(a).roles.some((r) => r.role.name === 'super_admin')).length,
        create: async ({ data }: { data: { email: string; name: string; passwordHash: string; roles?: { create: { roleId: string } } } }) => {
          const a = db.addAdmin(data.email, [], { name: data.name, passwordHash: data.passwordHash });
          if (data.roles) db.adminRoles.push({ adminUserId: a.id, roleId: data.roles.create.roleId });
          return db.adminShape(a);
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<FakeAdmin> }) =>
          Object.assign(db.admins.find((x) => x.id === where.id)!, data),
      },
      adminUserRole: {
        deleteMany: async ({ where }: { where: { adminUserId: string } }) => {
          db.adminRoles = db.adminRoles.filter((ar) => ar.adminUserId !== where.adminUserId);
        },
        create: async ({ data }: { data: { adminUserId: string; roleId: string } }) => {
          db.adminRoles.push(data);
        },
      },
      setting: {
        findUnique: async ({ where }: { where: { key: string } }) => (db.settings.has(where.key) ? { key: where.key, valueJson: db.settings.get(where.key) } : null),
        upsert: async ({ where, create }: { where: { key: string }; create: { key: string; valueJson: unknown } }) => {
          if (!db.settings.has(where.key)) db.settings.set(where.key, create.valueJson);
        },
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return api as unknown as PrismaService;
  }
}
