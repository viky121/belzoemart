import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isAuthorized, resolvePermissions } from './rbac.logic';

/**
 * DB-backed RBAC service (BR-9). Loads an admin's roles and their granted
 * permissions, delegating the decision to the pure `rbac.logic` functions.
 * Results are small and could be cached; kept direct for correctness first.
 */
@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<{ grants: Record<string, string[]>; all: string[] }> {
    const [roles, permissions] = await Promise.all([
      this.prisma.role.findMany({ include: { permissions: { include: { permission: true } } } }),
      this.prisma.permission.findMany(),
    ]);
    const grants: Record<string, string[]> = {};
    for (const role of roles) {
      grants[role.name] = role.permissions.map((rp) => rp.permission.key);
    }
    return { grants, all: permissions.map((p) => p.key) };
  }

  private async assignedRoles(adminUserId: string): Promise<string[]> {
    const rows = await this.prisma.adminUserRole.findMany({
      where: { adminUserId },
      include: { role: true },
    });
    return rows.map((r) => r.role.name);
  }

  async permissionsFor(adminUserId: string): Promise<string[]> {
    const [{ grants, all }, assigned] = await Promise.all([this.load(), this.assignedRoles(adminUserId)]);
    return resolvePermissions(assigned, grants, all);
  }

  async can(adminUserId: string, permission: string): Promise<boolean> {
    const [{ grants, all }, assigned] = await Promise.all([this.load(), this.assignedRoles(adminUserId)]);
    return isAuthorized(assigned, grants, all, permission);
  }
}
