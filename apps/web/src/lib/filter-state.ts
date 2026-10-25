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
