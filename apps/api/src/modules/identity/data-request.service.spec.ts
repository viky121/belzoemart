import { DataRequestService } from './data-request.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';

interface TokenRow {
  id: string;
  principalId: string;
  principalKind: 'customer' | 'admin';
  revokedAt: Date | null;
}

const OLD = new Date('2026-01-01T00:00:00Z');

/** In-memory fake covering the tables DataRequestService touches. */
function makeFake() {
  const customer: Record<string, unknown> = {
    id: 'c1',
    name: 'Asha',
    email: 'a@x.in',
    phone: '9876543210',
    passwordHash: 'hash',
    gender: 'f',
    dob: new Date('2000-01-01'),
    photoUrl: 'https://x/p.jpg',
    status: 'active',
  };
  const tokens: TokenRow[] = [
    { id: 't1', principalId: 'c1', principalKind: 'customer', revokedAt: null },
    { id: 't2', principalId: 'c1', principalKind: 'customer', revokedAt: null },
    { id: 't3', principalId: 'c1', principalKind: 'customer', revokedAt: OLD },
    { id: 't4', principalId: 'c2', principalKind: 'customer', revokedAt: null },
    { id: 't5', principalId: 'c1', principalKind: 'admin', revokedAt: null },
  ];
  const dataRequests: Record<string, Record<string, unknown>> = {
    dr1: { id: 'dr1', customerId: 'c1', type: 'deletion', status: 'pending' },
  };
  let seq = 0;

  const db = {
    dataRequest: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => dataRequests[id] ?? null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `new-${seq++}`, status: 'pending', ...data };
        dataRequests[row.id] = row;
        return row;
      }),
      update: jest.fn(
        async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          Object.assign(dataRequests[id]!, data);
          return dataRequests[id];
        },
      ),
    },
    address: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    customer: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(customer, data);
        return customer;
      }),
    },
    refreshToken: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { principalId: string; principalKind: string; revokedAt: null };
          data: { revokedAt: Date };
        }) => {
          let count = 0;
          for (const t of tokens) {
            if (
              t.principalId === where.principalId &&
              t.principalKind === where.principalKind &&
              t.revokedAt === null
            ) {
              t.revokedAt = data.revokedAt;
              count++;
            }
          }
          return { count };
        },
      ),
    },
  };
  const prisma = {
    ...db,
    $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  } as unknown as PrismaService;
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const svc = new DataRequestService(prisma, queue as unknown as QueueService);
  return { svc, db, prisma, queue, customer, tokens, dataRequests };
}

describe('DataRequestService', () => {
  describe('processDeletion (A2)', () => {
    it("revokes every unrevoked token of the customer inside the transaction", async () => {
      const f = makeFake();
      await f.svc.processDeletion('dr1');

      expect((f.prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
      expect(f.db.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { principalId: 'c1', principalKind: 'customer', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      const byId = Object.fromEntries(f.tokens.map((t) => [t.id, t.revokedAt]));
      expect(byId.t1).toBeInstanceOf(Date);
      expect(byId.t2).toBeInstanceOf(Date);
      // Already revoked stays as it was; other principals are untouched.
      expect(byId.t3).toBe(OLD);
      expect(byId.t4).toBeNull();
      expect(byId.t5).toBeNull();
    });

    it('still anonymises the profile and completes the request', async () => {
      const f = makeFake();
      await f.svc.processDeletion('dr1');
      expect(f.customer).toMatchObject({
        name: 'Deleted User',
        email: null,
        phone: null,
        passwordHash: null,
        gender: null,
        dob: null,
        photoUrl: null,
        status: 'blocked',
      });
      expect(f.db.address.deleteMany).toHaveBeenCalledWith({ where: { customerId: 'c1' } });
      expect(f.dataRequests.dr1).toMatchObject({ status: 'completed', completedAt: expect.any(Date) });
    });

    it('rejects an unknown data request without touching tokens', async () => {
      const f = makeFake();
      await expect(f.svc.processDeletion('missing')).rejects.toThrow('Data request not found');
      expect(f.db.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
