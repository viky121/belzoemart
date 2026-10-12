import type { Request } from 'express';
import {
  CLIENT_PLATFORM_HEADER,
  MOBILE_CLIENT_PLATFORM,
  mobileLogoutSchema,
  mobileRefreshSchema,
} from '@belzo/shared';

/**
 * Native clients (the Android app) cannot use the httpOnly refresh cookie, so
 * they opt in with `X-Client-Platform: mobile` and send/receive the refresh
 * token in the JSON body instead. Without the header nothing changes for the
 * web. A repeated header arrives as `string[]` and is deliberately treated as web.
 */
export function isMobileClient(req: Request): boolean {
  const v = req.headers[CLIENT_PLATFORM_HEADER]; // express lower-cases header names
  return typeof v === 'string' && v.trim().toLowerCase() === MOBILE_CLIENT_PLATFORM;
}

/** Body refresh token for a mobile refresh. Throws ZodError (→ 400) when missing/invalid. */
export function readMobileRefreshToken(req: Request): string {
  return mobileRefreshSchema.parse(req.body ?? {}).refreshToken;
}

/** Optional body refresh token for a mobile logout. Throws ZodError (→ 400) when invalid. */
export function readMobileLogoutToken(req: Request): string | undefined {
  return mobileLogoutSchema.parse(req.body ?? {}).refreshToken;
}
