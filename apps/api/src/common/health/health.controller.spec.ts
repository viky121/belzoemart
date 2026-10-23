import { HEARTBEAT_STALE_SECONDS, heartbeatAgeSeconds, heartbeatKey, isWorkerAlive, writeHeartbeat } from './worker-heartbeat';
import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

function fakeRedis(initial: Record<string, string> = {}, pingOk = true) {
  const store = new Map(Object.entries(initial));
  const client = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => void store.set(k, v),
    ping: async () => {
      if (!pingOk) throw new Error('down');
      return 'PONG';
    },
  };
  return { client, store };
}

describe('worker heartbeat', () => {
  const now = new Date('2026-10-23T10:00:00Z');

  it('writes the time and reads the age back', async () => {
    const r = fakeRedis();
    await writeHeartbeat(r.client as never, 'delivery', new Date(now.getTime() - 90_000));
    expect(r.store.get(heartbeatKey('delivery'))).toBe('2026-10-23T09:58:30.000Z');
    expect(await heartbeatAgeSeconds(r.client as never, 'delivery', now)).toBe(90);
  });

  it('is alive for up to three minutes and then not', async () => {
    const r = fakeRedis();
    await writeHeartbeat(r.client as never, 'delivery', new Date(now.getTime() - HEARTBEAT_STALE_SECONDS * 1000));
    expect(await isWorkerAlive(r.client as never, 'delivery', now)).toBe(true);
    await writeHeartbeat(r.client as never, 'delivery', new Date(now.getTime() - (HEARTBEAT_STALE_SECONDS + 1) * 1000));
    expect(await isWorkerAlive(r.client as never, 'delivery', now)).toBe(false);
  });

  it('is not alive when there is no heartbeat or it is garbage', async () => {
    expect(await isWorkerAlive(fakeRedis().client as never, 'delivery', now)).toBe(false);
    expect(await isWorkerAlive(fakeRedis({ [heartbeatKey('delivery')]: 'not a date' }).client as never, 'delivery', now)).toBe(false);
  });
});

describe('HealthController.ready', () => {
  const build = (redis: ReturnType<typeof fakeRedis>, dbOk = true) => {
    const prisma = { $queryRaw: async () => { if (!dbOk) throw new Error('db down'); return [1]; } } as unknown as PrismaService;
    return new HealthController(prisma, { client: redis.client } as unknown as RedisService);
  };

  it('is ok when the database, Redis and the delivery worker are all up', async () => {
    const redis = fakeRedis();
    await writeHeartbeat(redis.client as never, 'delivery');
    expect(await build(redis).ready()).toEqual({ status: 'ok', checks: { database: true, redis: true, deliveryWorker: true } });
  });

  it('is degraded, not failed, when only the delivery worker is silent', async () => {
    const r = await build(fakeRedis()).ready();
    expect(r.status).toBe('degraded');
    expect(r.checks).toEqual({ database: true, redis: true, deliveryWorker: false });
  });

  it('is degraded when the database or Redis is down', async () => {
    const redis = fakeRedis();
    await writeHeartbeat(redis.client as never, 'delivery');
    expect((await build(redis, false).ready()).checks.database).toBe(false);
    const down = fakeRedis({}, false);
    const r = await build(down).ready();
    expect(r.status).toBe('degraded');
    expect(r.checks.redis).toBe(false);
  });

  it('the shallow check is unchanged', () => {
    expect(build(fakeRedis()).live().status).toBe('ok');
  });
});
