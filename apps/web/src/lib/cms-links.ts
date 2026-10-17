/** A footer link to a CMS page (`/page/<slug>`). */
export interface PageLink {
  slug: string;
  label: string;
}

/** Company and policy pages linked from the storefront footer, in display order. */
export const FOOTER_PAGE_LINKS: PageLink[] = [
  { slug: 'about', label: 'About Us' },
  { slug: 'contact', label: 'Contact Us' },
  { slug: 'terms', label: 'Terms & Conditions' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'returns-policy', label: 'Return & Refund Policy' },
  { slug: 'shipping-policy', label: 'Shipping & Delivery Policy' },
  { slug: 'cancellation-policy', label: 'Cancellation Policy' },
  { slug: 'payment-policy', label: 'Payment Policy' },
  { slug: 'grievance-support', label: 'Grievance & Support' },
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
