/**
 * Base URL for API/upload requests.
 *
 * - **Browser**: returns `''` (same-origin). Requests go to the current host
 *   over the page's own scheme, and the reverse proxy (Caddy) routes `/api/*`
 *   to the API. This works on any host — the EC2 IP or `belzoemart.com`, HTTP
 *   or HTTPS — with no mixed-content blocking and no CORS (it's same-origin).
 *   It also means the browser never depends on the build-time
 *   `NEXT_PUBLIC_API_BASE_URL` value.
 * - **Server (SSR / RSC / route handlers)**: returns the internal API origin.
 *   It reads `API_INTERNAL_ORIGIN` **first** — a server-only runtime variable
 *   (NOT a `NEXT_PUBLIC_*` one, so Next does not inline it at build time), set
 *   to `http://api:4000` in the container. This makes SSR talk to the API
 *   directly over the Docker network instead of looping back out through the
 *   public domain and reverse proxy. Routing SSR through the proxy made every
 *   server render share a single rate-limit bucket (keyed to the host's own
 *   forwarded IP), which intermittently 429'd SSR fetches and flipped the
 *   storefront to its fallback theme with empty product rails.
 */
export function apiBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return (
    process.env.API_INTERNAL_ORIGIN ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:4000'
  );
}
