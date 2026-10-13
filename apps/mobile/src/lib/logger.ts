/**
 * __DEV__-only console logger. Callers must never pass tokens or PII; values that look like
 * bearer/refresh tokens are redacted defensively anyway.
 */
const TOKENISH = /(bearer\s+)?[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}/gi;

function scrub(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(TOKENISH, '[redacted]');
  if (value instanceof Error) return `${value.name}: ${scrub(value.message) as string}`;
  return value;
}

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const logger = {
  warn(...args: unknown[]): void {
    if (isDev) console.warn('[belzo]', ...args.map(scrub));
  },
  error(...args: unknown[]): void {
    if (isDev) console.error('[belzo]', ...args.map(scrub));
  },
};
