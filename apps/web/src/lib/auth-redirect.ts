'use client';

/**
 * Post-authentication redirect helpers (open-redirect safe).
 *
 * Guest-gated pages send users to `/login?next=<path>`; the login/signup pages
 * read that `next` param and return the user there after authenticating. Only
 * internal absolute paths are honored — anything with a scheme or a
 * protocol-relative `//host` prefix is rejected to prevent open redirects.
 */

/** Keep only safe internal paths (single leading slash, no `//`, no scheme). */
function sanitizeNext(n: string | null | undefined): string | null {
  if (!n) return null;
  if (!n.startsWith('/') || n.startsWith('//')) return null;
  return n;
}

/**
 * Build a `/login` URL that returns the user to `target` after sign-in.
 * Defaults to the current path + query when `target` is omitted.
 */
export function loginHref(target?: string): string {
  const raw =
    target ??
    (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/');
  const safe = sanitizeNext(raw) ?? '/';
  return `/login?next=${encodeURIComponent(safe)}`;
}

/** Read a safe post-auth redirect target from the current URL's `next` param. */
export function postAuthTarget(fallback = '/account'): string {
  if (typeof window === 'undefined') return fallback;
  const n = new URLSearchParams(window.location.search).get('next');
  return sanitizeNext(n) ?? fallback;
}
