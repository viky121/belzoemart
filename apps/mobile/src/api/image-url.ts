import { env } from '@/config/env';

export interface ImageUrlConfig {
  apiBaseUrl: string;
  cleartextHosts: string[];
}

// Regex instead of `new URL()`: RN's URL polyfill does not implement `hostname`.
const HTTP_HOST_RE = /^http:\/\/([^/:?#]+)/i;

/**
 * Image URL rules (design §13.1):
 * - null, empty, or `/seed/...` → null (RemoteImage shows its fallback)
 * - leading `/` → apiBaseUrl + url
 * - `http://` to a cleartext host → unchanged; other `http://` → rewritten to `https://`
 * - `https://` and `data:` → unchanged; anything else → null
 */
export function resolveImageUrlWith(
  url: string | null | undefined,
  config: ImageUrlConfig,
): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('/seed/')) return null;
  if (u.startsWith('//')) return null;
  if (u.startsWith('/')) return `${config.apiBaseUrl}${u}`;
  if (/^https:\/\//i.test(u) || /^data:/i.test(u)) return u;
  const m = HTTP_HOST_RE.exec(u);
  if (m) {
    const host = (m[1] ?? '').toLowerCase();
    if (config.cleartextHosts.map((h) => h.toLowerCase()).includes(host)) return u;
    return `https://${u.slice('http://'.length)}`;
  }
  return null;
}

export function resolveImageUrl(url: string | null | undefined): string | null {
  return resolveImageUrlWith(url, env);
}
