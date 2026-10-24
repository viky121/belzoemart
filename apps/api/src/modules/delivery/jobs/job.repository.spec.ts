import { JobRepository, PARTNER_HISTORY_DAYS } from './job.repository';
import type { PrismaService } from '../../../common/prisma/prisma.service';

/** Records the `where` of each query so the tests can check partner scoping (SP2, BR-D72). */
function build() {
  const calls: { method: string; args: Record<string, any> }[] = [];
  const rec = (method: string, result: unknown) => async (args: Record<string, any>) => {
    calls.push({ method, args });
    return result;
  };
  const prisma = {
    deliveryJob: {
      findFirst: rec('findFirst', null),
      findMany: rec('findMany', []),
      count: rec('count', 0),
      groupBy: rec('groupBy', [{ partnerId: 'p1', _count: { _all: 2 } }, { partnerId: null, _count: { _all: 9 } }]),
    },
    $queryRaw: async (..._a: unknown[]) => [{ now: new Date('2026-10-23T10:00:00Z') }],
  } as unknown as PrismaService;
  return { repo: new JobRepository(prisma), prisma, calls };
}

const NOW = new Date('2026-10-23T10:00:00Z');

describe('JobRepository', () => {
  it('always scopes a partner lookup by the partner id', async () => {
    const { repo, prisma, calls } = build();
    await repo.findForPartner(prisma, 'partner-1', 'job-1', NOW);
    const where = calls[0]?.args.where;
    expect(where.id).toBe('job-1');
    expect(where.partnerId).toBe('partner-1');
  });

  it('only lets a partner open finished jobs within the history window', async () => {
    const { repo, prisma, calls } = build();
    await repo.findForPartner(prisma, 'p', 'j', NOW);
    const finished = calls[0]?.args.where.OR[1];
    expect(finished.status.in).toEqual(['delivered', 'returned', 'cancelled']);
    const cutoff = finished.endedAt.gte as Date;
    expect(NOW.getTime() - cutoff.getTime()).toBe(PARTNER_HISTORY_DAYS * 24 * 3_600_000);
  });

  it('lists active jobs oldest first and history newest first, both scoped to the partner', async () => {
    const { repo, prisma, calls } = build();
    await repo.listForPartner(prisma, 'p9', 'active', 1, 20, NOW);
    await repo.listForPartner(prisma, 'p9', 'history', 2, 10, NOW);
    expect(calls[0]?.args.where.partnerId).toBe('p9');
    expect(calls[0]?.args.where.status.in).not.toContain('delivered');
    expect(calls[0]?.args.orderBy).toEqual({ createdAt: 'asc' });
    const history = calls.find((c) => c.method === 'findMany' && c.args.orderBy.endedAt === 'desc');
    expect(history?.args.where.partnerId).toBe('p9');
    expect(history?.args.skip).toBe(10);
    expect(history?.args.take).toBe(10);
  });

  it('counts only working statuses toward capacity', async () => {
    const { repo, prisma, calls } = build();
    await repo.countActiveForPartner(prisma, 'p1');
    expect(calls[0]?.args.where.status.in).toEqual([
      'assigned',
      'accepted',
      'picked_up',
      'out_for_delivery',
      'arrived',
      'failed_attempt',
    ]);
  });

  it('groups active counts by partner and skips rows without a partner', async () => {
    const { repo, prisma } = build();
    const map = await repo.countActiveByPartner(prisma, ['p1', 'p2']);
    expect([...map.entries()]).toEqual([['p1', 2]]);
    expect((await repo.countActiveByPartner(prisma, [])).size).toBe(0);
  });

  it('finds an order\'s working job by excluding the final statuses', async () => {
    const { repo, prisma, calls } = build();
    await repo.findActiveByOrder(prisma, 'order-1');
    expect(calls[0]?.args.where).toEqual({ orderId: 'order-1', status: { notIn: ['delivered', 'returned', 'cancelled'] } });
  });

  it('finds expired assigned jobs oldest deadline first with a limit', async () => {
    const { repo, prisma, calls } = build();
    await repo.findExpiredAssigned(prisma, NOW, 100);
    expect(calls[0]?.args.where).toEqual({ status: 'assigned', acceptDeadlineAt: { lte: NOW } });
    expect(calls[0]?.args.take).toBe(100);
  });

  it('reads the database clock', async () => {
    const { repo, prisma } = build();
    expect((await repo.now(prisma)).toISOString()).toBe('2026-10-23T10:00:00.000Z');
  });
});
