import { Logger } from '@nestjs/common';
import { DEFAULT_DELIVERY_SETTINGS } from '@belzo/shared';
import { DELIVERY_SCHEDULES, DELIVERY_WORKER_NAME, DeliveryWorker } from './delivery.worker';
import { QUEUES } from '../../../common/queue/queue.constants';
import { heartbeatKey } from '../../../common/health/worker-heartbeat';

const workerInstances: { on: jest.Mock; close: jest.Mock; name: string }[] = [];
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((name: string) => {
    const w = { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined), name };
    workerInstances.push(w);
    return w;
  }),
}));

const NOW = new Date('2026-10-23T10:00:00Z');

function build() {
  const calls: string[] = [];
  const store = new Map<string, string>();
  const redis = { client: { set: async (k: string, v: string) => void store.set(k, v), get: async (k: string) => store.get(k) ?? null } };
  const queue = { upsertScheduler: async (q: string, name: string, every: number) => void calls.push(`schedule:${q}:${name}:${every}`) };
  const repo = { now: async () => NOW };
  const jobs = {
    expireUnanswered: async (limit: number) => (calls.push(`expire:${limit}`), 2),
 clearOldGps: async (now: Date) => (calls.push(`gps:${now.toISOString()}`), 7),
    reconcileReturned: async (limit: number) => (calls.push(`reconcile:${limit}`), 1),
    cancelForOrder: async (id: string) => (calls.push(`cancelForOrder:${id}`), true),
  };
  const partners = { markStaleOffline: async (now: Date, minutes: number) => (calls.push(`stale:${now.toISOString()}:${minutes}`), 3) };
  const otp = { purgeExpired: async (now: Date) => (calls.push(`purge:${now.toISOString()}`), { expired: 1, deleted: 2 }) };
  const settings = { get: async () => ({ ...DEFAULT_DELIVERY_SETTINGS, offlineAfterMinutes: 20 }) };
  const w = new DeliveryWorker({} as never, redis as never, queue as never, repo as never, jobs as never, partners as never, otp as never, settings as never);
  return { w, calls, store };
}

describe('DeliveryWorker.handle', () => {
  beforeEach(() => void jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('accept-timeout expires unanswered jobs, at most 100 at a time', async () => {
    const t = build();
    expect(await t.w.handle({ name: 'accept-timeout', data: {} })).toEqual({ expired: 2 });
    expect(t.calls).toEqual(['expire:100']);
  });

  it('partner-stale uses the offline limit from the settings', async () => {
    const t = build();
    expect(await t.w.handle({ name: 'partner-stale', data: {} })).toEqual({ offline: 3 });
    expect(t.calls).toEqual([`stale:${NOW.toISOString()}:20`]);
  });

  it('otp-cleanup purges old codes and clears old GPS points', async () => {
    const t = build();
    expect(await t.w.handle({ name: 'otp-cleanup', data: {} })).toEqual({ expired: 1, deleted: 2, gpsCleared: 7 });
 expect(t.calls).toEqual([`purge:${NOW.toISOString()}`, `gps:${NOW.toISOString()}`]);
  });

  it('reconcile-returned repairs up to 50 orders', async () => {
    const t = build();
    expect(await t.w.handle({ name: 'reconcile-returned', data: {} })).toEqual({ fixed: 1 });
    expect(t.calls).toEqual(['reconcile:50']);
  });

  it('order.cancelled stops the order\'s job; a missing order id is skipped', async () => {
    const t = build();
    expect(await t.w.handle({ name: 'order.cancelled', data: { orderId: 'o1' } })).toEqual({ cancelled: true });
    expect(await t.w.handle({ name: 'order.cancelled', data: {} })).toEqual({ skipped: 'no order id' });
    expect(t.calls).toEqual(['cancelForOrder:o1']);
  });

  it('an unknown job is skipped without failing', async () => {
    const t = build();
    expect(await t.w.handle({ name: 'mystery', data: {} })).toEqual({ skipped: 'mystery' });
  });
});

describe('DeliveryWorker start-up', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registers each schedule once with its fixed interval and writes a heartbeat', async () => {
    const t = build();
    await t.w.onModuleInit();
    expect(t.calls).toEqual(DELIVERY_SCHEDULES.map((s) => `schedule:${QUEUES.DELIVERY}:${s.name}:${s.everyMs}`));
    expect(t.store.has(heartbeatKey(DELIVERY_WORKER_NAME))).toBe(true);
    expect(workerInstances.at(-1)?.name).toBe(QUEUES.DELIVERY);
    await t.w.onModuleDestroy();
    expect(workerInstances.at(-1)?.close).toHaveBeenCalled();
  });

  it('runs the four jobs the design lists', () => {
    expect(DELIVERY_SCHEDULES.map((s) => s.name).sort()).toEqual(['accept-timeout', 'otp-cleanup', 'partner-stale', 'reconcile-returned']);
    expect(DELIVERY_SCHEDULES.find((s) => s.name === 'accept-timeout')?.everyMs).toBe(60_000);
    expect(DELIVERY_SCHEDULES.find((s) => s.name === 'otp-cleanup')?.everyMs).toBe(3_600_000);
  });
});
