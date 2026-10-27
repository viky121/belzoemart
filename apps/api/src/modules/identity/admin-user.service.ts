import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SUPER_ADMIN_ROLE_NAME } from '@belzo/shared';
import { AdminAccessService } from '../../common/auth/admin-access.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A random TOTP secret in base32 (what authenticator apps expect). */
export function generateBase32Secret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

export interface StaffView {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
  mfaEnabled: boolean;
  createdAt: Date;
  /** The staff type. Normally one; an older account may hold several, then the Super Admin type comes first. */
  role: { id: string; name: string } | null;
  roleCount: number;
  isSuperAdmin: boolean;
}

const STAFF_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  mfaEnabled: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;

type StaffRow = {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
  mfaEnabled: boolean;
  createdAt: Date;
  roles: { role: { id: string; name: string } }[];
};

function toView(row: StaffRow): StaffView {
  const roles = row.roles.map((r) => r.role);
  const sorted = [...roles].sort((a, b) => Number(b.name === SUPER_ADMIN_ROLE_NAME) - Number(a.name === SUPER_ADMIN_ROLE_NAME) || a.name.localeCompare(b.name));
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    mfaEnabled: row.mfaEnabled,
    createdAt: row.createdAt,
    role: sorted[0] ? { id: sorted[0].id, name: sorted[0].name } : null,
    roleCount: roles.length,
    isSuperAdmin: roles.some((r) => r.name === SUPER_ADMIN_ROLE_NAME),
  };
}

/**
 * Staff administration (FR-13.1). Only the Super Admin reaches these routes (`staff.manage`). Every change is
 * written to the audit log, and takes effect on the staff member's next request.
 *
 * Safety rules: you cannot switch yourself off or change your own type, the last active Super Admin cannot be
 * switched off or moved, and the Super Admin type cannot be handed out from this screen.
 */
@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly access: AdminAccessService,
    private readonly audit: AuditLogService,
  ) {}

  async list(): Promise<StaffView[]> {
    const rows = await this.prisma.adminUser.findMany({ select: STAFF_SELECT, orderBy: { createdAt: 'asc' } });
    return rows.map(toView);
  }

  async create(
    actorId: string,
    input: { email: string; name: string; password: string; roleId: string },
  ): Promise<StaffView> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) throw new ConflictException('A staff member with this email already exists.');
    const role = await this.assignableRole(input.roleId);
    const created = await this.prisma.adminUser.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash: await this.passwords.hash(input.password),
        roles: { create: { roleId: role.id } },
      },
      select: STAFF_SELECT,
    });
    await this.audit.record(actorId, 'staff.create', created.id, undefined, { email, role: role.name });
    return toView(created);
  }

  async update(
    actorId: string,
    id: string,
    input: { name?: string; roleId?: string; status?: 'active' | 'disabled' },
  ): Promise<StaffView> {
    const target = await this.prisma.adminUser.findUnique({ where: { id }, select: STAFF_SELECT });
    if (!target) throw new NotFoundException('Staff member not found');
    const before = toView(target);
    const self = actorId === id;

    const changesType = input.roleId !== undefined && input.roleId !== before.role?.id;
    const switchesOff = input.status === 'disabled' && before.status === 'active';
    if (self && (changesType || switchesOff)) {
      throw new ForbiddenException('You cannot change your own type or switch yourself off.');
    }
    if (before.isSuperAdmin && (changesType || switchesOff)) await this.assertAnotherSuperAdmin(id);

    const data: { name?: string; status?: 'active' | 'disabled' } = {};
    if (input.name !== undefined && input.name.trim() !== '') data.name = input.name.trim();
    if (input.status !== undefined) data.status = input.status;

    let newRoleName: string | undefined;
    if (changesType) {
      const role = await this.assignableRole(input.roleId as string);
      newRoleName = role.name;
      await this.prisma.$transaction([
        this.prisma.adminUserRole.deleteMany({ where: { adminUserId: id } }),
        this.prisma.adminUserRole.create({ data: { adminUserId: id, roleId: role.id } }),
      ]);
    }
    if (Object.keys(data).length > 0) await this.prisma.adminUser.update({ where: { id }, data });
    if (switchesOff) await this.tokens.revokeAllFor(id, 'admin');

    const after = await this.prisma.adminUser.findUnique({ where: { id }, select: STAFF_SELECT });
    this.access.invalidate(id);
    await this.audit.record(
      actorId,
      'staff.update',
      id,
      { name: before.name, status: before.status, role: before.role?.name },
      { name: data.name ?? before.name, status: data.status ?? before.status, role: newRoleName ?? before.role?.name },
    );
    return toView(after as StaffRow);
  }

  /** Set a new password (the Super Admin tells it to the person). Signs them out everywhere. */
  async resetPassword(actorId: string, id: string, password: string): Promise<void> {
    const target = await this.prisma.adminUser.findUnique({ where: { id }, select: { id: true } });
    if (!target) throw new NotFoundException('Staff member not found');
    await this.prisma.adminUser.update({ where: { id }, data: { passwordHash: await this.passwords.hash(password) } });
    await this.tokens.revokeAllFor(id, 'admin');
    await this.audit.record(actorId, 'staff.password_reset', id);
  }

  /** Provision a TOTP secret; the returned otpauth URL is shown once for QR setup. */
  async enableMfa(actorId: string, adminUserId: string): Promise<{ otpauthUrl: string }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminUserId } });
    if (!admin) throw new NotFoundException('Staff member not found');
    const secret = generateBase32Secret();
    await this.prisma.adminUser.update({ where: { id: adminUserId }, data: { mfaSecret: secret, mfaEnabled: true } });
    await this.audit.record(actorId, 'staff.mfa_enable', adminUserId);
    const label = encodeURIComponent(`Belzo eMart:${admin.email}`);
    return { otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=Belzo%20eMart` };
  }

  async disableMfa(actorId: string, adminUserId: string): Promise<void> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminUserId }, select: { id: true } });
    if (!admin) throw new NotFoundException('Staff member not found');
    await this.prisma.adminUser.update({ where: { id: adminUserId }, data: { mfaSecret: null, mfaEnabled: false } });
    await this.audit.record(actorId, 'staff.mfa_disable', adminUserId);
  }

  /** A type that can be handed to a staff member: it exists and is not the Super Admin type. */
  private async assignableRole(roleId: string): Promise<{ id: string; name: string }> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, isSystem: true } });
    if (!role) throw new NotFoundException('Staff type not found');
    if (role.isSystem || role.name === SUPER_ADMIN_ROLE_NAME) {
      throw new BadRequestException('The Super Admin type cannot be given from here.');
    }
    return role;
  }

  private async assertAnotherSuperAdmin(exceptId: string): Promise<void> {
    const others = await this.prisma.adminUser.count({
      where: { id: { not: exceptId }, status: 'active', roles: { some: { role: { name: SUPER_ADMIN_ROLE_NAME } } } },
    });
    if (others === 0) throw new ForbiddenException('This is the last active Super Admin. Make another one first.');
  }
}
