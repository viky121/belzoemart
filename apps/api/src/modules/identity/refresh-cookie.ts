import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Refresh-token cookie helpers. The refresh token is stored in an
 * httpOnly + secure + sameSite=strict cookie so it is never accessible to JS
 * and is not sent cross-site (SECURITY-12). `secure` is disabled only in
 * development over http.
 */
export const REFRESH_COOKIE = 'belzo_rt';
/**
 * Admins get a SEPARATE refresh cookie from customers. Both apps share this API
 * origin, and the storefront's AuthProvider (mounted app-wide, including on
 * /admin pages) silently calls the customer /auth/refresh on load. When admin
 * and customer shared one cookie, that call rotated — and thus revoked — the
 * admin's refresh token, so the admin session died intermittently and the panel
 * (products/categories/orders) emptied until a fresh login. Distinct names keep
 * the two sessions fully independent.
 */
export const ADMIN_REFRESH_COOKIE = 'belzo_art';

export type RefreshScope = 'customer' | 'admin';
const cookieName = (scope: RefreshScope): string =>
  scope === 'admin' ? ADMIN_REFRESH_COOKIE : REFRESH_COOKIE;

/**
 * Whether to mark the refresh cookie `Secure`. Browsers silently REJECT Secure
 * cookies set over plain HTTP, so keying this on NODE_ENV broke sessions on the
 * HTTP-only deployment (refresh never stored -> 401s once the access token
 * expired). Derive it from the public URL scheme instead; COOKIE_SECURE=true|false
 * overrides. Once the site moves to HTTPS this becomes Secure automatically.
 */
function cookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return (process.env.PUBLIC_BASE_URL ?? '').startsWith('https://');
}

export function setRefreshCookie(res: Response, token: string, scope: RefreshScope = 'customer'): void {
  res.cookie(cookieName(scope), token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'strict',
    // Scoped to the whole API so the relevant refresh/logout endpoints receive
    // it. Customer and admin are separated by cookie NAME, not path.
    path: '/api/v1',
    maxAge: Number(process.env.JWT_REFRESH_TTL ?? 1_209_600) * 1000,
  });
}

export function clearRefreshCookie(res: Response, scope: RefreshScope = 'customer'): void {
  res.clearCookie(cookieName(scope), { path: '/api/v1' });
}

export function readRefreshCookie(req: Request, required = true, scope: RefreshScope = 'customer'): string {
  const token = (req.cookies as Record<string, string> | undefined)?.[cookieName(scope)];
  if (!token && required) throw new UnauthorizedException('Missing refresh token');
  return token ?? '';
}
