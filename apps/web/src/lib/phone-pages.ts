import type { CategoryNodeDto, ProductCardDto } from '@belzo/shared';

/** The few sub-category names shown under a category on the Categories tab (like the app). */
export function subtitleFor(node: Pick<CategoryNodeDto, 'children'>): string {
  const names = node.children.slice(0, 3).map((c) => c.name);
  return names.length > 0 ? names.join(', ') : 'Shop all products';
}

/** The biggest discount in a list of products (0 when none has one). */
export function topDiscount(items: readonly Pick<ProductCardDto, 'discountPct'>[]): number {
  return items.reduce((max, p) => Math.max(max, p.discountPct), 0);
}
