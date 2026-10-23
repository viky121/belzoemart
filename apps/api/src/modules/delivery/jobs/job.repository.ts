import { Injectable } from '@nestjs/common';
import type { DeliveryJob, Prisma } from '@prisma/client';
import { DELIVERY_ACTIVE_STATUSES, DELIVERY_FINAL_STATUSES, type DeliveryStatus } from '@belzo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';

export type Tx = Prisma.TransactionClient;
/** Either the shared client or a transaction client. */
export type Db = PrismaService | Tx;

/** Partners may look back this many days at jobs they finished (BR-D72, BR-D73). */
export const PARTNER_HISTORY_DAYS = 30;

const ACTIVE = DELIVERY_ACTIVE_STATUSES as DeliveryStatus[];
const FINAL = DELIVERY_FINAL_STATUSES as DeliveryStatus[];

/**
 * The only place that reads and writes delivery job tables for the partner and engine paths
 * (SP2). Every partner finder takes the partner id, so there is no way to list jobs without
 * a scope. Locking uses a bound-parameter tagged template (SECURITY-05).
 */
@Injectable()
export class JobRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Run `fn` in one transaction. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { maxWait: 5_000, timeout: 20_000 });
  }

  /** Database time: deadlines and expiry use one clock (no skew between API and worker). */
  async now(db: Db): Promise<Date> {
    const rows = await db.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    return rows[0]?.now ?? new Date();
  }

  /** Lock the job row until the transaction ends, then return it (or null). */
  async lockJob(tx: Tx, jobId: string): Promise<DeliveryJob | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "delivery_jobs" WHERE "id" = ${jobId} FOR UPDATE`;
    if (locked.length === 0) return null;
    return tx.deliveryJob.findUnique({ where: { id: jobId } });
  }

  /** A job the partner currently holds, or finished within the history window. Anything else is null (404). */
  findForPartner(db: Db, partnerId: string, jobId: string, now: Date): Promise<DeliveryJob | null> {
    return db.deliveryJob.findFirst({
      where: {
        id: jobId,
        partnerId,
        OR: [{ status: { in: ACTIVE } }, { status: { in: FINAL }, endedAt: { gte: historyCutoff(now) } }],
      },
    });
  }

  async listForPartner(
    db: Db,
    partnerId: string,
    scope: 'active' | 'history',
    page: number,
    pageSize: number,
    now: Date,
  ): Promise<{ rows: DeliveryJob[]; total: number }> {
    const where: Prisma.DeliveryJobWhereInput =
      scope === 'active'
        ? { partnerId, status: { in: ACTIVE } }
        : { partnerId, status: { in: FINAL }, endedAt: { gte: historyCutoff(now) } };
    const [rows, total] = await Promise.all([
      db.deliveryJob.findMany({
        where,
        orderBy: scope === 'active' ? { createdAt: 'asc' } : { endedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.deliveryJob.count({ where }),
    ]);
    return { rows, total };
  }

  /** Jobs that count toward a partner's capacity (BR-D11). */
  countActiveForPartner(db: Db, partnerId: string): Promise<number> {
    return db.deliveryJob.count({ where: { partnerId, status: { in: ACTIVE } } });
  }

  /** Active job counts for many partners at once (suggestions and partner lists). */
  async countActiveByPartner(db: Db, partnerIds: string[]): Promise<Map<string, number>> {
    if (partnerIds.length === 0) return new Map();
    const groups = await db.deliveryJob.groupBy({
      by: ['partnerId'],
      where: { partnerId: { in: partnerIds }, status: { in: ACTIVE } },
      _count: { _all: true },
    });
    return new Map(groups.flatMap((g) => (g.partnerId ? [[g.partnerId, g._count._all] as [string, number]] : [])));
  }

  /** The job that is currently working on an order, if any (BR-D10). */
  findActiveByOrder(db: Db, orderId: string): Promise<DeliveryJob | null> {
    return db.deliveryJob.findFirst({ where: { orderId, status: { notIn: FINAL } } });
  }

  /** Ids of `assigned` jobs whose deadline has passed (BR-D19). */
  async findExpiredAssigned(db: Db, now: Date, limit: number): Promise<string[]> {
    const rows = await db.deliveryJob.findMany({
      where: { status: 'assigned', acceptDeadlineAt: { lte: now } },
      orderBy: { acceptDeadlineAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}

function historyCutoff(now: Date): Date {
  return new Date(now.getTime() - PARTNER_HISTORY_DAYS * 24 * 3_600_000);
}
