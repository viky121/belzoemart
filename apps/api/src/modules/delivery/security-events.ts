import { Injectable, Logger } from '@nestjs/common';
import { maskMobile } from '@belzo/shared';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Fixed names for delivery security events (SECURITY-14, SP8). They are written as structured
 * log lines and also counted per hour in Redis, so the admin dashboard can show the last 24 hours.
 * Mobile numbers are masked; codes, passwords and tokens are never passed in.
 */
export const SECURITY_EVENTS = {
  LOGIN_FAILED: 'partner.login.failed',
  LOGIN_LOCKED: 'partner.login.locked',
  TOKEN_REUSE: 'partner.token.reuse',
  ACCESS_DENIED: 'partner.access.denied',
  OTP_LOCKED: 'delivery.otp.locked',
  OTP_UNLOCKED: 'delivery.otp.unlocked',
  ADMIN_OVERRIDE: 'delivery.admin.override',
} as const;
export type SecurityEventName = (typeof SECURITY_EVENTS)[keyof typeof SECURITY_EVENTS];

/** The four numbers shown on the dashboard. */
const COUNTED: Partial<Record<SecurityEventName, 'failedLogins24h' | 'lockedLogins24h' | 'otpLocks24h' | 'foreignJobAttempts24h'>> = {
  [SECURITY_EVENTS.LOGIN_FAILED]: 'failedLogins24h',
  [SECURITY_EVENTS.LOGIN_LOCKED]: 'lockedLogins24h',
  [SECURITY_EVENTS.OTP_LOCKED]: 'otpLocks24h',
  [SECURITY_EVENTS.ACCESS_DENIED]: 'foreignJobAttempts24h',
};

export interface SecurityCounters {
  failedLogins24h: number;
  lockedLogins24h: number;
  otpLocks24h: number;
  foreignJobAttempts24h: number;
}

const HOUR_MS = 3_600_000;
const bucket = (t: number): number => Math.floor(t / HOUR_MS);
const key = (name: string, b: number): string => `delivery:sec:${name}:${b}`;

@Injectable()
export class DeliverySecurityEvents {
  private readonly logger = new Logger('DeliverySecurity');

  constructor(private readonly redis: RedisService) {}

  /** Log an event and count it. Never throws: monitoring must not break the request. */
  async record(event: SecurityEventName, data: Record<string, unknown> = {}): Promise<void> {
    const safe: Record<string, unknown> = { event };
    for (const [k, v] of Object.entries(data)) {
      safe[k] = k.toLowerCase().includes('mobile') || k.toLowerCase().includes('phone') ? maskMobile(String(v)) : v;
    }
    this.logger.warn(safe, event);
    const counter = COUNTED[event];
    if (!counter) return;
    try {
      const k = key(counter, bucket(Date.now()));
      await this.redis.client.incr(k);
      await this.redis.client.expire(k, 26 * 3600);
    } catch (e) {
      this.logger.error({ err: e instanceof Error ? e.message : String(e) }, 'could not count security event');
    }
  }

  /** Counts for the last 24 hours (zeros when Redis is unavailable). */
  async counters24h(now: number = Date.now()): Promise<SecurityCounters> {
    const out: SecurityCounters = { failedLogins24h: 0, lockedLogins24h: 0, otpLocks24h: 0, foreignJobAttempts24h: 0 };
    try {
      const current = bucket(now);
      for (const name of Object.keys(out) as (keyof SecurityCounters)[]) {
        const keys = Array.from({ length: 24 }, (_, i) => key(name, current - i));
        const values = await this.redis.client.mget(...keys);
        out[name] = values.reduce((sum, v) => sum + (v ? Number(v) || 0 : 0), 0);
      }
    } catch (e) {
      this.logger.error({ err: e instanceof Error ? e.message : String(e) }, 'could not read security counters');
    }
    return out;
  }
}
