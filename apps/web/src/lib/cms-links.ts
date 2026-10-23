/** A footer link to a CMS page (`/page/<slug>`). */
export interface PageLink {
  slug: string;
  label: string;
  /** Which footer column it belongs to: general links, or the legal policies. */
  group: 'company' | 'policy';
}

/** Company and policy pages linked from the storefront footer, in display order. */
export const FOOTER_PAGE_LINKS: PageLink[] = [
  { slug: 'about', label: 'About Us', group: 'company' },
  { slug: 'contact', label: 'Contact Us', group: 'company' },
  { slug: 'grievance-support', label: 'Grievance & Support', group: 'company' },
  { slug: 'terms', label: 'Terms & Conditions', group: 'policy' },
  { slug: 'privacy', label: 'Privacy Policy', group: 'policy' },
  { slug: 'returns-policy', label: 'Return & Refund Policy', group: 'policy' },
  { slug: 'shipping-policy', label: 'Shipping & Delivery Policy', group: 'policy' },
  { slug: 'cancellation-policy', label: 'Cancellation Policy', group: 'policy' },
  { slug: 'payment-policy', label: 'Payment Policy', group: 'policy' },
];

/**
 * Keep only the links whose page is enabled. `active` is the list of enabled page slugs
 * from the API; `null` means it could not be fetched, in which case every link is kept
 * (a missing page then shows the normal "not found" page rather than a footer with holes).
 */
export function visibleLinks<T extends { slug: string }>(links: T[], active: readonly string[] | null | undefined): T[] {
  if (!active) return links;
  const on = new Set(active);
  return links.filter((l) => on.has(l.slug));
}

/** The visible footer links of one column, in display order. */
export function footerColumn(group: PageLink['group'], active: readonly string[] | null | undefined): PageLink[] {
  return visibleLinks(
    FOOTER_PAGE_LINKS.filter((l) => l.group === group),
    active,
  );
}
