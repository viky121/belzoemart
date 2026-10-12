import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Number of reverse-proxy hops in front of the API (Caddy). With one trusted
 * hop, `req.ip` is the rightmost `X-Forwarded-For` entry, i.e. the address
 * Caddy saw, so ThrottlerGuard (which keys on `req.ip`) buckets per client.
 * The API port is internal-only, so clients cannot bypass Caddy to spoof XFF.
 */
export const TRUSTED_PROXY_HOPS = 1;

export function configureTrustProxy(app: NestExpressApplication): void {
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
}
