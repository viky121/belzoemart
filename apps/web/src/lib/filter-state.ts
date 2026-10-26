/** How many filters are switched on: a brand counts as one, a price band (min and/or max) counts as one. */
export function activeFilterCount(params: { get(name: string): string | null }): number {
  const brand = params.get('brandId') ? 1 : 0;
  const price = params.get('minPrice') || params.get('maxPrice') ? 1 : 0;
  return brand + price;
}

/**
 * The phone filter panel is open only for the exact filters it was opened on. Any change of the URL (a brand
 * chosen, a price picked, "clear") makes this false, which is how the panel closes after a choice.
 */
export function isPanelOpen(openedOn: string | null, currentQuery: string): boolean {
  return openedOn !== null && openedOn === currentQuery;
}

/** Brands shown in the filter before "Show all". */
export const BRANDS_COLLAPSED = 8;

/**
 * The brands to draw in the filter. Collapsed: the first few, and the chosen brand is always among them (moved
 * to the front) so the customer can see and switch off what is on. Expanded: every brand.
 */
export function visibleBrands<T extends { id: string }>(brands: readonly T[], selectedId: string, expanded: boolean, limit = BRANDS_COLLAPSED): T[] {
  if (expanded || brands.length <= limit) return [...brands];
  const head = brands.slice(0, limit);
  if (!selectedId || head.some((b) => b.id === selectedId)) return head;
  const chosen = brands.find((b) => b.id === selectedId);
  return chosen ? [chosen, ...head.slice(0, limit - 1)] : head;
}
