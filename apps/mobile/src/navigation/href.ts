import type { ProductSort } from '@belzo/shared';

import type { RootRouteName } from './types';

/** Result of mapping a web href (CMS links, banners, promos) onto the app (design §2.7). */
export type HrefTarget =
  | { kind: 'route'; name: RootRouteName; params?: object }
  | { kind: 'external'; url: string };

const SORTS: readonly ProductSort[] = [
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'popularity',
  'rating',
  'discount',
];

// Regex parsing instead of `new URL()`: RN's URL polyfill lacks host/pathname getters.
const ABSOLUTE_RE = /^(https?):\/\/([^/?#]+)([^#]*)(#.*)?$/i;

function hostOf(base: string): string | null {
  const m = ABSOLUTE_RE.exec(base.trim());
  return m ? (m[2] ?? '').toLowerCase() : null;
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const k = safeDecode(idx < 0 ? pair : pair.slice(0, idx));
    const v = safeDecode(idx < 0 ? '' : pair.slice(idx + 1));
    if (k && v !== null && !(k in out)) out[k] = v;
  }
  return out;
}

function asSort(s: string | undefined): ProductSort | undefined {
  return s && (SORTS as readonly string[]).includes(s) ? (s as ProductSort) : undefined;
}

function mapPath(pathAndQuery: string): HrefTarget | null {
  const qIdx = pathAndQuery.indexOf('?');
  let path = qIdx < 0 ? pathAndQuery : pathAndQuery.slice(0, qIdx);
  const query = parseQuery(qIdx < 0 ? '' : pathAndQuery.slice(qIdx + 1));
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path === '') path = '/';

  if (path === '/') return { kind: 'route', name: 'Main', params: { screen: 'HomeTab' } };

  const segments = path.slice(1).split('/');
  const [head, second, ...rest] = segments;
  if (rest.length > 0) return null;
  const slug = second !== undefined ? safeDecode(second) : undefined;
  if (second !== undefined && !slug) return null;

  switch (head) {
    case 'search': {
      if (second !== undefined) return null;
      const q = query.q?.trim();
      const sort = asSort(query.sort);
      if (q) return { kind: 'route', name: 'Search', params: sort ? { q, sort } : { q } };
      return {
        kind: 'route',
        name: 'ProductList',
        params: { sort: sort ?? 'relevance', title: 'All products' },
      };
    }
    case 'category':
      return slug ? { kind: 'route', name: 'ProductList', params: { categorySlug: slug } } : null;
    case 'product':
      return slug ? { kind: 'route', name: 'ProductDetail', params: { idOrSlug: slug } } : null;
    case 'page':
      return slug ? { kind: 'route', name: 'CmsPage', params: { slug } } : null;
    case 'orders':
      return slug
        ? { kind: 'route', name: 'OrderDetail', params: { id: slug } }
        : { kind: 'route', name: 'Orders' };
    case 'cart':
      return slug ? null : { kind: 'route', name: 'Cart' };
    case 'account':
      return slug ? null : { kind: 'route', name: 'Main', params: { screen: 'AccountTab' } };
    case 'wishlist':
      return slug ? null : { kind: 'route', name: 'Wishlist' };
    case 'notifications':
      return slug ? null : { kind: 'route', name: 'Notifications' };
    default:
      return null;
  }
}

/**
 * Maps a web href to an app route, an external URL, or null (not tappable).
 * Same-host absolute URLs (host of `apiBaseUrl`) are mapped like relative paths.
 */
export function hrefToRoute(
  href: string | null | undefined,
  apiBaseUrl: string,
): HrefTarget | null {
  if (href == null) return null;
  const h = href.trim();
  if (h === '' || h === '#') return null;

  if (h.startsWith('/') && !h.startsWith('//')) return mapPath(h.split('#')[0] ?? h);

  const m = ABSOLUTE_RE.exec(h);
  if (m) {
    const host = (m[2] ?? '').toLowerCase();
    if (host && host === hostOf(apiBaseUrl)) return mapPath(m[3] || '/');
    return { kind: 'external', url: h };
  }
  return null;
}
