import { ForbiddenException, Injectable } from '@nestjs/common';
import { ALL_PERMISSION_KEYS, SUPER_ADMIN_ROLE_NAME, isPermissionKey } from '@belzo/shared';
import { PrismaService } from '../prisma/prisma.service';

/** What an admin may do right now, worked out from their staff type in the database. */
export interface AdminAccess {
  adminId: string;
  status: 'active' | 'disabled';
  /** Names of the staff types the admin holds (normally one). */
  roles: string[];
  isSuperAdmin: boolean;
  permissions: ReadonlySet<string>;
}

/** True when the access holds the permission (the Super Admin holds all of them). */
export function accessCan(access: AdminAccess | undefined, key: string): boolean {
  if (!access || access.status !== 'active') return false;
  return access.isSuperAdmin || access.permissions.has(key);
}

/** Throws 403 unless the access holds the permission. For checks that depend on the request (e.g. CSV download). */
export function assertAccessCan(access: AdminAccess | undefined, key: string, message = 'You do not have permission for this'): void {
  if (!accessCan(access, key)) throw new ForbiddenException(message);
}

/**
 * Looks up an admin's current access. The answer is kept for a few seconds so a busy page does not hit the
 * database for every request; anything that changes access (a staff type, a staff member's type or status)
 * calls `invalidate()`, so the change applies on the very next click.
 */
@Injectable()
export class AdminAccessService {
  static readonly TTL_MS = 10_000;
  private readonly cache = new Map<string, { at: number; value: AdminAccess | null }>();

  constructor(private readonly prisma: PrismaService) {}

  /** The admin's access, or null when no such admin exists. */
  async get(adminId: string, now: number = Date.now()): Promise<AdminAccess | null> {
    const hit = this.cache.get(adminId);
    if (hit && now - hit.at < AdminAccessService.TTL_MS) return hit.value;
    const value = await this.load(adminId);
    this.cache.set(adminId, { at: now, value });
    return value;
  }

  /** Forget one admin's cached access, or everyone's when no id is given. */
  invalidate(adminId?: string): void {
    if (adminId) this.cache.delete(adminId);
    else this.cache.clear();
  }

  private async load(adminId: string): Promise<AdminAccess | null> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: {
        status: true,
        roles: {
          select: {
            role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } },
          },
        },
      },
    });
    if (!admin) return null;
    const roles = admin.roles.map((r) => r.role.name);
    const isSuperAdmin = roles.includes(SUPER_ADMIN_ROLE_NAME);
    const granted = new Set<string>();
    for (const r of admin.roles) {
      for (const p of r.role.permissions) if (isPermissionKey(p.permission.key)) granted.add(p.permission.key);
    }
    return {
      adminId,
      status: admin.status,
      roles,
      isSuperAdmin,
      permissions: isSuperAdmin ? new Set<string>(ALL_PERMISSION_KEYS) : granted,
    };
  }
}
