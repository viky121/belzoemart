import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Throttler guard that only rate-limits traffic arriving through the Caddy
 * reverse proxy.
 *
 * All public browser traffic reaches the API via Caddy, which sets an
 * `X-Forwarded-For` header (and `trust proxy: 1` makes `req.ip` the real client
 * IP — see trust-proxy.ts). Our own services (the Next.js web app doing SSR,
 * and the worker) call the API *directly* on the internal Docker network at
 * `http://api:4000`, so their requests carry **no** `X-Forwarded-For` header.
 *
 * Without this guard, that internal traffic has no forwarded IP, so Express
 * falls back to the caller's socket address — a single container IP shared by
 * every SSR render for every user. One shared 100/60s bucket then trips `429`s
 * on SSR bursts (e.g. the home page fetching theme + content + per-category
 * product rails), which surfaced as the storefront intermittently rendering the
 * fallback theme and empty product rails.
 *
 * The API port is internal-only (never published), so external clients cannot
 * bypass Caddy to reach it without an `X-Forwarded-For`. Skipping throttling
 * when that header is absent therefore safely exempts only our own internal
 * service-to-service traffic, while every real client stays throttled per IP.
 */
@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.headers['x-forwarded-for']) return true;
    return super.shouldSkip(context);
  }
}
