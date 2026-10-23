export type OfferLink =
  | { kind: 'none' }
  | { kind: 'internal'; href: string }
  | { kind: 'external'; href: string };

/**
 * How an offer banner's link behaves on the website. Empty or "#" means the banner is
 * a plain picture. A path on this site ("/category/grocery") is a normal in-site link;
 * a full http(s) address opens as an external link. Anything else (javascript:, data:,
 * odd schemes) is ignored so a mistyped or hostile link can never run on the page.
 */
export function offerLink(raw: string | null | undefined): OfferLink {
  const href = (raw ?? '').trim();
  if (href === '' || href === '#') return { kind: 'none' };
  if (href.startsWith('/') && !href.startsWith('//')) return { kind: 'internal', href };
  if (/^https?:\/\//i.test(href)) {
    try {
      new URL(href);
      return { kind: 'external', href };
    } catch {
      return { kind: 'none' };
    }
  }
  return { kind: 'none' };
}
