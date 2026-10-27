import { SearchLogService, SEARCH_DEDUPE_SECONDS, SEARCH_RETENTION_DAYS } from './search-log.service';

/** Saving real searches: cleaning, the 30 second rule, the logged-in customer, and never breaking. */
function make(over: { total?: number; first?: string | null; seen?: Set<string>; createFails?: boolean; verify?: (t: string) => unknown } = {}) {
  const seen = over.seen ?? new Set<string>();
  const created: Record<string, unknown>[] = [];
  const prisma = {
    searchLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (over.createFails) throw new Error('db down');
        created.push(data);
        return data;
      }),
      findMany: jest.fn(async () => [] as { id: string }[]),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const redis = {
    client: {
      set: jest.fn(async (key: string, _v: string, _ex: string, _ttl: number, _nx: string) => {
        if (seen.has(key)) return null;
        seen.add(key);
        return 'OK';
      }),
    },
  };
  const jwt = {
    verifyAsync: jest.fn(async (t: string) => {
      const v = over.verify ? over.verify(t) : { sub: 'cust-1', kind: 'customer', roles: [] };
      if (v instanceof Error) throw v;
      return v;
    }),
  };
  const items = over.first === null ? [] : [{ id: over.first ?? 'prod-1' }];
  const search = { search: jest.fn(async () => ({ items, total: over.total ?? items.length, page: 1, pageSize: 1 })) };
  const svc = new SearchLogService(prisma as never, redis as never, jwt as never, search as never);
  return { svc, prisma, redis, jwt, search, created, seen };
}

describe('SearchLogService.record', () => {
  it('saves the tidied keyword with the result count and the product found first', async () => {
    const { svc, created, search } = make({ total: 12, first: 'prod-9' });
    expect(await svc.record({ q: '  Basmati   RICE ', source: 'web', ip: '1.2.3.4' })).toBe(true);
    expect(created).toEqual([
      { term: 'Basmati RICE', termNorm: 'basmati rice', source: 'web', resultCount: 12, topProductId: 'prod-9', customerId: null },
    ]);
    expect(search.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'Basmati RICE', page: 1, pageSize: 1 }));
  });

  it('saves a search that found nothing with zero results and no product', async () => {
    const { svc, created } = make({ first: null, total: 0 });
    expect(await svc.record({ q: 'zzzxx', source: 'app', ip: '1.2.3.4' })).toBe(true);
    expect(created[0]).toMatchObject({ resultCount: 0, topProductId: null, source: 'app' });
  });

  it('does not save text that is too short or not text', async () => {
    const { svc, created, search } = make();
    expect(await svc.record({ q: ' a ', source: 'web' })).toBe(false);
    expect(await svc.record({ q: undefined, source: 'web' })).toBe(false);
    expect(await svc.record({ q: 5, source: 'web' })).toBe(false);
    expect(created).toHaveLength(0);
    expect(search.search).not.toHaveBeenCalled();
  });

  it('saves the same search from the same place once inside 30 seconds', async () => {
    const { svc, created, redis } = make();
    expect(await svc.record({ q: 'Sugar', source: 'web', ip: '9.9.9.9' })).toBe(true);
    expect(await svc.record({ q: ' sugar ', source: 'web', ip: '9.9.9.9' })).toBe(false);
    expect(created).toHaveLength(1);
    expect(redis.client.set).toHaveBeenCalledWith(expect.stringMatching(/^searchlog:[0-9a-f]{40}$/), '1', 'EX', SEARCH_DEDUPE_SECONDS, 'NX');
  });

  it('saves it again for another place, another source or another word', async () => {
    const { svc, created } = make();
    await svc.record({ q: 'sugar', source: 'web', ip: '1.1.1.1' });
    await svc.record({ q: 'sugar', source: 'web', ip: '2.2.2.2' });
    await svc.record({ q: 'sugar', source: 'app', ip: '1.1.1.1' });
    await svc.record({ q: 'salt', source: 'web', ip: '1.1.1.1' });
    expect(created).toHaveLength(4);
  });

  it('saves the logged-in customer, and never the address', async () => {
    const { svc, created } = make();
    await svc.record({ q: 'tea', source: 'app', authorization: 'Bearer good', ip: '5.5.5.5' });
    expect(created[0]).toMatchObject({ customerId: 'cust-1' });
    expect(JSON.stringify(created[0])).not.toContain('5.5.5.5');
  });

  it('saves a guest without a customer when the token is missing, bad, or not a customer token', async () => {
    const bad = make({ verify: () => new Error('expired') });
    await bad.svc.record({ q: 'tea', source: 'web', authorization: 'Bearer old', ip: '1.1.1.1' });
    expect(bad.created[0]).toMatchObject({ customerId: null });
    const admin = make({ verify: () => ({ sub: 'a1', kind: 'admin', roles: [] }) });
    await admin.svc.record({ q: 'tea', source: 'web', authorization: 'Bearer adm', ip: '1.1.1.1' });
    expect(admin.created[0]).toMatchObject({ customerId: null });
    const none = make();
    await none.svc.record({ q: 'tea', source: 'web', ip: '1.1.1.1' });
    expect(none.jwt.verifyAsync).not.toHaveBeenCalled();
    expect(none.created[0]).toMatchObject({ customerId: null });
  });

  it('never throws when saving fails', async () => {
    const { svc } = make({ createFails: true });
    await expect(svc.record({ q: 'tea', source: 'web', ip: '1.1.1.1' })).resolves.toBe(false);
  });

  it('never throws when the search itself fails', async () => {
    const { svc, search } = make();
    search.search.mockRejectedValueOnce(new Error('search down'));
    await expect(svc.record({ q: 'tea', source: 'web', ip: '1.1.1.1' })).resolves.toBe(false);
  });
});

describe('SearchLogService.purgeOlderThan', () => {
  it('deletes searches older than the cutoff in batches until none are left', async () => {
    const { svc, prisma } = make();
    const batch = Array.from({ length: 5_000 }, (_, i) => ({ id: `r${i}` }));
    prisma.searchLog.findMany.mockResolvedValueOnce(batch).mockResolvedValueOnce([{ id: 'x' }]);
    prisma.searchLog.deleteMany.mockResolvedValueOnce({ count: 5_000 }).mockResolvedValueOnce({ count: 1 });
    const cutoff = new Date('2025-10-25T00:00:00Z');
    expect(await svc.purgeOlderThan(cutoff)).toBe(5_001);
    expect(prisma.searchLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdAt: { lt: cutoff } } }));
    expect(prisma.searchLog.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('cleans up after a save, once a day, and keeps 12 months', async () => {
    const { svc, prisma, redis } = make();
    await svc.record({ q: 'tea', source: 'web', ip: '1.1.1.1' });
    await svc.record({ q: 'coffee', source: 'web', ip: '1.1.1.1' });
    await new Promise((r) => setImmediate(r));
    const purgeKeys = redis.client.set.mock.calls.filter((c) => String(c[0]).startsWith('searchlog:purged:'));
    expect(purgeKeys).toHaveLength(2);
    expect(prisma.searchLog.findMany).toHaveBeenCalledTimes(1); // the second call found today's key already set
    const cutoff = (prisma.searchLog.findMany.mock.calls[0] as unknown as [{ where: { createdAt: { lt: Date } } }])[0].where.createdAt.lt;
    const days = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(SEARCH_RETENTION_DAYS);
  });
});
