import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PERMISSION_DEFS, ROLE_TEMPLATES, SUPER_ADMIN_ROLE_NAME } from '@belzo/shared';
import { AdminAccessService } from '../../common/auth/admin-access.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Set once the ready-made staff types have been created, so edits and deletions are never undone. */
export const TEMPLATES_MARKER = 'rbac.templates.v1';

/**
 * Keeps the permission list in the database in step with the code, and creates the ready-made staff types once.
 *
 *  - Every start: make sure each permission of the catalogue exists, drop old ones that are gone, and make sure
 *    the protected Super Admin type exists.
 *  - First start only (marker): create Admin, Manager, Accountant, and give the five older types the permissions
 *    that match what they could do before. After that nothing is touched again, so a type you edit, rename or
 *    delete stays that way.
 *
 * It never stops the app from starting: a failure is logged and the next start tries again.
 */
@Injectable()
export class RbacBootstrapService implements OnModuleInit {
  private readonly log = new Logger(RbacBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.run();
    } catch (e) {
      this.log.error(`RBAC bootstrap failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async run(): Promise<{ templatesCreated: boolean }> {
    await this.syncPermissions();
    await this.ensureSuperAdminRole();
    const marker = await this.prisma.setting.findUnique({ where: { key: TEMPLATES_MARKER } });
    let templatesCreated = false;
    if (!marker) {
      await this.applyTemplates();
      await this.prisma.setting.upsert({
        where: { key: TEMPLATES_MARKER },
        update: {},
        create: { key: TEMPLATES_MARKER, valueJson: { at: new Date().toISOString() } },
      });
      templatesCreated = true;
    }
    this.access.invalidate();
    return { templatesCreated };
  }

  private async syncPermissions(): Promise<void> {
    const rows = await this.prisma.permission.findMany({ select: { id: true, key: true, description: true } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const def of PERMISSION_DEFS) {
      const row = byKey.get(def.key);
      if (!row) {
        await this.prisma.permission.upsert({
          where: { key: def.key },
          update: { description: def.help },
          create: { key: def.key, description: def.help },
        });
      } else if (row.description !== def.help) {
        await this.prisma.permission.update({ where: { id: row.id }, data: { description: def.help } });
      }
    }
    const known = new Set<string>(PERMISSION_DEFS.map((d) => d.key));
    const obsolete = rows.filter((r) => !known.has(r.key)).map((r) => r.id);
    // The older coarse keys (catalogue.read, order.write, ...) are replaced by the list above.
    if (obsolete.length > 0) await this.prisma.permission.deleteMany({ where: { id: { in: obsolete } } });
  }

  private async ensureSuperAdminRole(): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: SUPER_ADMIN_ROLE_NAME } });
    if (!role) {
      await this.prisma.role.create({
        data: { name: SUPER_ADMIN_ROLE_NAME, description: 'Everything, always. Cannot be edited or deleted.', isSystem: true },
      });
    } else if (!role.isSystem) {
      await this.prisma.role.update({ where: { id: role.id }, data: { isSystem: true } });
    }
  }

  private async applyTemplates(): Promise<void> {
    for (const template of ROLE_TEMPLATES) {
      let role = await this.prisma.role.findUnique({ where: { name: template.name } });
      if (!role) {
        role = await this.prisma.role.create({ data: { name: template.name, description: template.description } });
      } else if (role.description === '' || role.description === role.name) {
        role = await this.prisma.role.update({ where: { id: role.id }, data: { description: template.description } });
      }
      const perms = await this.prisma.permission.findMany({
        where: { key: { in: [...template.permissions] } },
        select: { id: true },
      });
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
        this.prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) }),
      ]);
    }
  }
}
