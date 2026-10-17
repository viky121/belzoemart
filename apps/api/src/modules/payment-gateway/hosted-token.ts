import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * What a hosted-checkout link carries. The mobile app opens this link in the
 * phone's browser, which has no login session, so the link itself is the
 * (short-lived, single-order) credential.
 */
export interface HostedTokenPayload {
  /** Our order id. */
  o: string;
  /** Customer id the link was issued to. */
  c: string;
  /** App deep link to return to when the payment finishes. */
  r: string;
  /** Expiry, unix seconds. */
  e: number;
}

/** Link lifetime: long enough to finish a UPI/bank flow, short enough to be useless later. */
export const HOSTED_TOKEN_TTL_SECONDS = 45 * 60;

/** Deep-link schemes the app registers (production + development/preview builds). */
const ALLOWED_RETURN_SCHEMES = ['belzoemart:', 'belzoemart-dev:'];

/** Only our own app's deep links may receive the customer back (no open redirect). */
export function isAllowedReturnUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return ALLOWED_RETURN_SCHEMES.includes(u.protocol);
  } catch {
    return false;
  }
}

function key(secret: string): Buffer {
  // Domain-separate from the JWT use of the same secret.
  return createHash('sha256').update(`payment-hosted-link:${secret}`).digest();
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', key(secret)).update(body).digest('base64url');
}

export function signHostedToken(payload: HostedTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** Returns the payload when the token is authentic and unexpired, otherwise null. */
export function verifyHostedToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): HostedTokenPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1 || token.length > 2000) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<HostedTokenPayload>;
    if (
      typeof p.o !== 'string' ||
      typeof p.c !== 'string' ||
      typeof p.r !== 'string' ||
      typeof p.e !== 'number' ||
      p.e < nowSeconds ||
      !isAllowedReturnUrl(p.r)
    ) {
      return null;
    }
    return { o: p.o, c: p.c, r: p.r, e: p.e };
  } catch {
    return null;
  }
}
