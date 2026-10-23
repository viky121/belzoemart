import type { Redis } from 'ioredis';

/**
 * A worker proves it is alive by writing the current time to Redis every minute. The health
 * check reads it back (RESILIENCY-06). The key expires on its own, so a dead worker also
 * disappears from the record.
 */
export const HEARTBEAT_INTERVAL_MS = 60_000;
/** A heartbeat older than this means the worker is considered down (3 minutes). */
export const HEARTBEAT_STALE_SECONDS = 180;
const TTL_SECONDS = 600;

export const heartbeatKey = (name: string): string => `worker:heartbeat:${name}`;

export async function writeHeartbeat(redis: Pick<Redis, 'set'>, name: string, now: Date = new Date()): Promise<void> {
  await redis.set(heartbeatKey(name), now.toISOString(), 'EX', TTL_SECONDS);
}

/** Seconds since the last heartbeat, or null if there is none. */
export async function heartbeatAgeSeconds(redis: Pick<Redis, 'get'>, name: string, now: Date = new Date()): Promise<number | null> {
  const raw = await redis.get(heartbeatKey(name));
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 1000));
}

export async function isWorkerAlive(redis: Pick<Redis, 'get'>, name: string, now: Date = new Date()): Promise<boolean> {
  const age = await heartbeatAgeSeconds(redis, name, now);
  return age !== null && age <= HEARTBEAT_STALE_SECONDS;
}
