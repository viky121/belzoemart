/**
 * "Selected products" banner link: a tap opens a page that lists a hand-picked set of products.
 * Stored as a normal in-app path so it survives `safeHrefSchema`, the website and the app:
 *
 *   /products?ids=<uuid>,<uuid>&title=Festive%20offers
 */

/** Most products one banner can point at (matches the app's list page size, so one page shows them all). */
export const PRODUCTS_LINK_MAX = 20;
export const PRODUCTS_LINK_TITLE_MAX = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keeps valid, distinct product ids in the given order (at most {@link PRODUCTS_LINK_MAX}). */
export function cleanProductIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim().toLowerCase();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= PRODUCTS_LINK_MAX) break;
  }
  return out;
}

/** Builds the link; '#' (not tappable) when there is nothing valid to show. */
export function productsLinkHref(ids: readonly string[], title = ''): string {
  const clean = cleanProductIds(ids);
  if (clean.length === 0) return '#';
  const t = title.trim().slice(0, PRODUCTS_LINK_TITLE_MAX);
  return `/products?ids=${clean.join(',')}${t ? `&title=${encodeURIComponent(t)}` : ''}`;
}

export interface ProductsLink {
  ids: string[];
  title: string;
}

/** Reads a `/products?ids=…` path (relative or with a host). Null when it is not one, or has no valid id. */
export function parseProductsLink(href: string | null | undefined): ProductsLink | null {
  if (!href) return null;
  const m = /^(?:https?:\/\/[^/?#]+)?\/products\/?\?([^#]*)/i.exec(href.trim());
  if (!m) return null;
  let ids: string[] = [];
  let title = '';
  for (const pair of (m[1] ?? '').split('&')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx);
    let value: string;
    try {
      value = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
    } catch {
      continue;
    }
    if (key === 'ids' && ids.length === 0) ids = cleanProductIds(value.split(','));
    else if (key === 'title' && title === '') title = value.trim().slice(0, PRODUCTS_LINK_TITLE_MAX);
  }
  return ids.length > 0 ? { ids, title } : null;
}
