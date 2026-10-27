import type { ProductCardDto } from '@belzo/shared';

/** Adds the next page to what is already on screen, leaving out any product that is already there. */
export function mergeProducts(current: readonly ProductCardDto[], next: readonly ProductCardDto[]): ProductCardDto[] {
  const seen = new Set(current.map((p) => p.id));
  return [...current, ...next.filter((p) => !seen.has(p.id))];
}

/** More products can be loaded when fewer than `total` are on screen and the last page brought something. */
export function hasMoreProducts(loaded: number, total: number, lastPageCount: number): boolean {
  return lastPageCount > 0 && loaded < total;
}

/** The query string of page `page`: the listing's own filters and sort, with `page` set. */
export function pageQuery(query: string, page: number): string {
  const qs = new URLSearchParams(query);
  qs.set('page', String(page));
  return qs.toString();
}
