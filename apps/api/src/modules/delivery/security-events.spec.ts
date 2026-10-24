import { Logger } from '@nestjs/common';
import { DeliverySecurityEvents, SECURITY_EVENTS } from './security-events';
import type { RedisService } from '../../common/redis/redis.service';

function fakeRedis(failing = false) {
  const store = new Map<string, number>();
  const client = {
    incr: async (k: string) => {
      if (failing) throw new Error('redis down');
      store.set(k, (store.get(k) ?? 0) + 1);
      return store.get(k);
    },
    expire: async () => 1,
    mget: async (...keys: string[]) => {
      if (failing) throw new Error('redis down');
      return keys.map((k) => (store.has(k) ? String(store.get(k)) : null));
    },
  };
  return { redis: { client } as unknown as RedisService, store };
}

describe('DeliverySecurityEvents', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs the fixed event name and masks mobile numbers', async () => {
    const { redis } = fakeRedis();
    await new DeliverySecurityEvents(redis).record(SECURITY_EVENTS.LOGIN_FAILED, { mobile: '9876543210', ip: '1.2.3.4' });
    const [payload, message] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('partner.login.failed');
    expect(payload.mobile).toBe('XXXXXX3210');
    expect(JSON.stringify(payload)).not.toContain('9876543210');
  });

  it('counts the dashboard events and sums the last 24 hours', async () => {
    const { redis } = fakeRedis();
    const sec = new DeliverySecurityEvents(redis);
    await sec.record(SECURITY_EVENTS.LOGIN_FAILED, {});
    await sec.record(SECURITY_EVENTS.LOGIN_FAILED, {});
    await sec.record(SECURITY_EVENTS.OTP_LOCKED, {});
    await sec.record(SECURITY_EVENTS.ACCESS_DENIED, {});
    await sec.record(SECURITY_EVENTS.ADMIN_OVERRIDE, {}); // logged, not counted
    expect(await sec.counters24h()).toEqual({
      failedLogins24h: 2,
      lockedLogins24h: 0,
      otpLocks24h: 1,
      foreignJobAttempts24h: 1,
    });
  });

  it('does not count events older than 24 hours', async () => {
    const { redis } = fakeRedis();
    const sec = new DeliverySecurityEvents(redis);
    await sec.record(SECURITY_EVENTS.LOGIN_LOCKED, {});
    const in25Hours = Date.now() + 25 * 3_600_000;
    expect((await sec.counters24h(in25Hours)).lockedLogins24h).toBe(0);
  });

  it('never throws when Redis is down (fail soft)', async () => {
    const { redis } = fakeRedis(true);
    const sec = new DeliverySecurityEvents(redis);
    await expect(sec.record(SECURITY_EVENTS.LOGIN_FAILED, {})).resolves.toBeUndefined();
    expect((await sec.counters24h()).failedLogins24h).toBe(0);
  });
});
