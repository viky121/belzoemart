/**
 * Pure helpers for the product editor's "Variants, price & stock" section.
 * Money is integer paise on the wire; the inputs are rupee strings.
 */

/** Raw variant row from GET /admin/products/:productId/variants. */
export interface AdminVariantRow {
  id: string;
  productId: string;
  sku: string;
  mrp: number;
  sellingPrice: number;
  attributesJson: Record<string, string> | null;
  priceSlabsJson: { minQty: number; unitPrice: number }[] | null;
  weightGrams: number;
  imageUrl: string | null;
  inventory: { available: number } | null;
}

/** Editable form state for one variant (all strings, as typed). */
export interface VariantEdit {
  sku: string;
  mrp: string;
  price: string;
  stock: string;
}

/** Body accepted by POST /admin/variants. */
export interface VariantUpsertBody {
  id: string;
  productId: string;
  sku: string;
  mrp: number;
  sellingPrice: number;
  attributes: Record<string, string>;
  weightGrams: number;
  imageUrl: string | undefined;
  priceSlabs: { minQty: number; unitPrice: number }[];
}

export function toRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function toPaise(r: string): number {
  return Math.round(parseFloat(r || '0') * 100);
}

export function initialEdit(v: AdminVariantRow): VariantEdit {
  return {
    sku: v.sku,
    mrp: toRupees(v.mrp),
    price: toRupees(v.sellingPrice),
    stock: String(v.inventory?.available ?? 0),
  };
}

function isMoney(r: string): boolean {
  const s = r.trim();
  if (s === '') return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
}

/** First validation problem across all variants, or null when every edit is valid. */
export function validateEdits(
  variants: AdminVariantRow[],
  edits: Record<string, VariantEdit>,
): string | null {
  const seen = new Set<string>();
  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    const e = edits[v.id] ?? initialEdit(v);
    const sku = e.sku.trim();
    if (!sku) return `Variant ${i + 1}: SKU is required.`;
    if (sku.length > 60) return `${sku}: SKU must be 60 characters or fewer.`;
    if (!isMoney(e.mrp)) return `${sku}: enter a valid MRP (0 or more).`;
    if (!isMoney(e.price)) return `${sku}: enter a valid selling price (0 or more).`;
    if (toPaise(e.price) > toPaise(e.mrp)) return `${sku}: selling price cannot exceed MRP`;
    if (!/^\d+$/.test(e.stock.trim())) return `${sku}: stock must be a whole number (0 or more).`;
    if (seen.has(sku)) return `SKU "${sku}" is used twice`;
    seen.add(sku);
  }
  return null;
}

/**
 * POST /admin/variants body for a changed SKU/MRP/price, or null when nothing
 * changed. The variant's existing bulk tiers, attributes, weight and image
 * are always sent back because the endpoint overwrites them.
 */
export function variantUpsertBody(v: AdminVariantRow, e: VariantEdit): VariantUpsertBody | null {
  const sku = e.sku.trim();
  const mrp = toPaise(e.mrp);
  const sellingPrice = toPaise(e.price);
  if (sku === v.sku && mrp === v.mrp && sellingPrice === v.sellingPrice) return null;
  return {
    id: v.id,
    productId: v.productId,
    sku,
    mrp,
    sellingPrice,
    attributes: v.attributesJson ?? {},
    weightGrams: v.weightGrams,
    imageUrl: v.imageUrl ?? undefined,
    priceSlabs: v.priceSlabsJson ?? [],
  };
}

/** Inventory adjustment needed to reach the typed stock (target - current). */
export function stockDelta(v: AdminVariantRow, e: VariantEdit): number {
  return parseInt(e.stock, 10) - (v.inventory?.available ?? 0);
}
