import type { Money } from './money';

/**
 * Catalogue pure helpers and DTO types shared by API and web.
 */

/**
 * Convert a name into a URL-safe slug. Idempotent: slugify(slugify(x)) ==
 * slugify(x). Lowercases, replaces non-alphanumerics with single hyphens, and
 * trims leading/trailing hyphens.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derived discount percentage from MRP and selling price. Returns an integer in
 * [0, 100]. Zero when mrp <= 0 or sellingPrice >= mrp.
 */
export function discountPct(mrp: Money, sellingPrice: Money): number {
  if (mrp <= 0 || sellingPrice >= mrp) return 0;
  const pct = Math.round(((mrp - sellingPrice) / mrp) * 100);
  return Math.max(0, Math.min(100, pct));
}

export type ProductSort =
  | 'relevance'
  | 'price_asc'
  | 'price_desc'
  | 'newest'
  | 'popularity'
  | 'rating'
  | 'discount';

export interface CategoryNodeDto {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: CategoryNodeDto[];
}

/** A quantity price tier: at `minQty` units or more, `unitPrice` (paise) applies. */
export interface PriceSlabTier {
  minQty: number;
  unitPrice: Money;
}

/**
 * Resolve the effective per-unit price for a quantity given optional bulk
 * slabs. Picks the highest-threshold slab whose `minQty <= qty`; if none apply
 * (or there are no slabs) the flat `base` price is used. Pure + shared so the
 * API (cart/checkout) and the web UI agree on pricing.
 */
export function resolveSlabPrice(
  base: Money,
  slabs: PriceSlabTier[] | undefined | null,
  qty: number,
): Money {
  if (!slabs || slabs.length === 0) return base;
  let price = base;
  for (const s of [...slabs].sort((a, b) => a.minQty - b.minQty)) {
    if (qty >= s.minQty) price = s.unitPrice;
  }
  return price;
}

export interface VariantDto {
  id: string;
  sku: string;
  mrp: Money;
  sellingPrice: Money;
  discountPct: number;
  attributes: Record<string, string>;
  imageUrl: string | null;
  inStock: boolean;
  /** Optional bulk pricing tiers (minQty ascending). Empty = flat pricing. */
  priceSlabs: PriceSlabTier[];
}

export interface ProductCardDto {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  mrp: Money;
  sellingPrice: Money;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  /** Cheapest in-stock variant id, so listings can add to cart directly. */
  defaultVariantId?: string | null;
  /** Pack/size label for the default variant, e.g. "1 kg", "1 L", "500 ml". */
  unit?: string | null;
}

export interface ProductDetailDto extends ProductCardDto {
  description: string;
  brand: string | null;
  categoryId: string;
  hsnCode: string;
  taxRatePct: number;
  images: { url: string; alt: string }[];
  videoUrl: string | null;
  variants: VariantDto[];
  /** SHG that made the product + its story (FMCG/handicraft storytelling). */
  shgName?: string | null;
  story?: string | null;
  /** Product-level attributes (fabric, occasion, care, origin, pattern, dimensions…). */
  attributes?: Record<string, string>;
  /** SEO metadata for the product page <head>. */
  seo?: { title: string | null; keywords: string | null; description: string | null };
  /** False when the product cannot be returned (e.g. food). Defaults true. */
  isReturnable?: boolean;
}
