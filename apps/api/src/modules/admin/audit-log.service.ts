import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Admin activity audit log (FR-13.1, SECURITY-13). Records who changed what and
 * when, with optional before/after snapshots for critical mutations.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(actorId: string, action: string, target: string, before?: unknown, after?: unknown) {
    return this.prisma.adminAuditLog.create({
      data: {
        actorId,
        action,
        target,
        beforeJson: before === undefined ? undefined : (before as object),
        afterJson: after === undefined ? undefined : (after as object),
      },
    });
  }

  list(query: { page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }
}
