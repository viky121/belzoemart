/**
 * Base URL for API/upload requests.
 *
 * - **Browser**: returns `''` (same-origin). Requests go to the current host
 *   over the page's own scheme, and the reverse proxy (Caddy) routes `/api/*`
 *   to the API. This works on any host — the EC2 IP or `belzoemart.com`, HTTP
 *   or HTTPS — with no mixed-content blocking and no CORS (it's same-origin).
 *   It also means the browser never depends on the build-time
 *   `NEXT_PUBLIC_API_BASE_URL` value.
 * - **Server (SSR / RSC / route handlers)**: returns the configured base
 *   (`NEXT_PUBLIC_API_BASE_URL`, set to the internal `http://api:4000` in the
 *   container), because the server cannot use a relative URL.
 */
export function apiBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
}
