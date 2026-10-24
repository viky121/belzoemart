import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ALL_PERMISSION_KEYS,
  GRANTABLE_PERMISSION_KEYS,
  PERMISSION_DEFS,
  SUPER_ADMIN_ROLE_NAME,
  isPermissionKey,
  normalizePermissions,
  validRoleName,
  type PermissionKey,
} from '@belzo/shared';
import { AdminAccessService } from '../../common/auth/admin-access.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';

export interface RoleView {
  id: string;
  name: string;
  description: string;
  /** The Super Admin type: it has every permission and cannot be edited, renamed or deleted. */
  isSystem: boolean;
  permissions: PermissionKey[];
  staffCount: number;
}

const normalizeName = (name: string) => name.toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Staff types (roles): a name plus the permissions ticked for it. Only the Super Admin reaches these routes
 * (`staff.manage`). The Super Admin type is protected, and `staff.manage` itself can never be given to a type,
 * so nobody can raise their own access.
 */
@Injectable()
export class AdminRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
    private readonly audit: AuditLogService,
  ) {}

  async list(): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { admins: true } },
      },
    });
    return roles
      .map((r) => this.view(r))
      .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name));
  }

  async create(actorId: string, input: { name: string; description?: string; permissions: string[] }): Promise<RoleView> {
    const name = this.checkName(input.name);
    await this.assertNameFree(name);
    const permissions = this.checkPermissions(input.permissions);
    const role = await this.prisma.role.create({
      data: { name, description: (input.description ?? '').trim().slice(0, 300) },
      select: { id: true },
    });
    await this.setPermissions(role.id, permissions);
    const created = await this.get(role.id);
    await this.audit.record(actorId, 'role.create', role.id, undefined, { name, permissions });
    this.access.invalidate();
    return created;
  }

  async update(
    actorId: string,
    id: string,
    input: { name?: string; description?: string; permissions?: string[] },
  ): Promise<RoleView> {
    const before = await this.get(id);
    if (before.isSystem) throw new BadRequestException('The Super Admin type cannot be changed.');
    const data: { name?: string; description?: string } = {};
    if (input.name !== undefined && input.name.trim() !== before.name) {
      const name = this.checkName(input.name);
      await this.assertNameFree(name, id);
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description.trim().slice(0, 300);
    if (Object.keys(data).length > 0) await this.prisma.role.update({ where: { id }, data });
    if (input.permissions !== undefined) await this.setPermissions(id, this.checkPermissions(input.permissions));
    const after = await this.get(id);
    await this.audit.record(actorId, 'role.update', id, { name: before.name, permissions: before.permissions }, {
      name: after.name,
      permissions: after.permissions,
    });
    this.access.invalidate();
    return after;
  }

  async remove(actorId: string, id: string): Promise<void> {
    const role = await this.get(id);
    if (role.isSystem) throw new BadRequestException('The Super Admin type cannot be deleted.');
    if (role.staffCount > 0) {
      throw new ConflictException(
        `${role.staffCount} staff ${role.staffCount === 1 ? 'member has' : 'members have'} this type. Move them to another type first.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    await this.audit.record(actorId, 'role.delete', id, { name: role.name, permissions: role.permissions });
    this.access.invalidate();
  }

  private async get(id: string): Promise<RoleView> {
    const r = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { admins: true } },
      },
    });
    if (!r) throw new NotFoundException('Staff type not found');
    return this.view(r);
  }

  private view(r: {
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
    permissions: { permission: { key: string } }[];
    _count: { admins: number };
  }): RoleView {
    const held = new Set(r.permissions.map((p) => p.permission.key));
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.isSystem || r.name === SUPER_ADMIN_ROLE_NAME ? [...ALL_PERMISSION_KEYS] : ALL_PERMISSION_KEYS.filter((k) => held.has(k)),
      staffCount: r._count.admins,
    };
  }

  private checkName(raw: string): string {
    const name = validRoleName(raw);
    if (!name) {
      throw new BadRequestException(
        'Give the type a name of 2 to 40 letters or numbers. "Super Admin" is reserved.',
      );
    }
    return name;
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const all = await this.prisma.role.findMany({ select: { id: true, name: true } });
    const clash = all.find((r) => r.id !== exceptId && normalizeName(r.name) === normalizeName(name));
    if (clash) throw new ConflictException('A staff type with this name already exists.');
  }

  /** Unknown keys are an error (a typo must not silently grant nothing); Super Admin only keys are refused. */
  private checkPermissions(keys: string[]): PermissionKey[] {
    const unknown = keys.filter((k) => !isPermissionKey(k));
    if (unknown.length > 0) throw new BadRequestException(`Unknown permission: ${unknown[0]}`);
    const notGrantable = keys.filter((k) => !(GRANTABLE_PERMISSION_KEYS as readonly string[]).includes(k));
    if (notGrantable.length > 0) {
      const label = PERMISSION_DEFS.find((d) => d.key === notGrantable[0])?.label ?? notGrantable[0];
      throw new BadRequestException(`"${label}" is kept for the Super Admin and cannot be given to a staff type.`);
    }
    return normalizePermissions(keys);
  }

  /** Makes the type hold exactly these permissions. */
  private async setPermissions(roleId: string, keys: PermissionKey[]): Promise<void> {
    const rows = await this.prisma.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
    if (rows.length !== keys.length) {
      throw new BadRequestException('The permission list is not ready yet. Please try again in a minute.');
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({ data: rows.map((p) => ({ roleId, permissionId: p.id })) }),
    ]);
  }
}
