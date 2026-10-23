import { isWeightUnit, pickAttr, type WeightUnit } from '@belzo/shared';

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
  /** Weight / pack size as entered by the admin, with its unit (null on older variants). */
  weightValue?: number | null;
  weightUnit?: string | null;
  imageUrl: string | null;
  /** Purchase price, paise. Admin-only; null when not recorded. */
  costPrice: number | null;
  /** Fewest / most units a customer can buy per order; null = no limit. */
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
  inventory: { available: number } | null;
}

/** Editable form state for one variant (all strings, as typed). */
export interface VariantEdit {
  sku: string;
  mrp: string;
  price: string;
  /** Purchase price in rupees; blank = not recorded. */
  cost: string;
  stock: string;
  /** Fewest / most units per order as typed; blank = no limit. */
  minQty?: string;
  maxQty?: string;
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
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  imageUrl: string | undefined;
  priceSlabs: { minQty: number; unitPrice: number }[];
  costPrice: number | null;
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
    cost: v.costPrice == null ? '' : toRupees(v.costPrice),
    stock: String(v.inventory?.available ?? 0),
    minQty: v.minOrderQty == null ? '' : String(v.minOrderQty),
    maxQty: v.maxOrderQty == null ? '' : String(v.maxOrderQty),
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
    if (e.cost.trim() !== '' && !isMoney(e.cost)) {
      return `${sku}: enter a valid purchase price (0 or more), or leave it blank.`;
    }
    if (!/^\d+$/.test(e.stock.trim())) return `${sku}: stock must be a whole number (0 or more).`;
    const limits = validateOrderLimits(e.minQty ?? '', e.maxQty ?? '');
    if (limits) return `${sku}: ${limits}`;
    if (seen.has(sku)) return `SKU "${sku}" is used twice`;
    seen.add(sku);
  }
  return null;
}

/**
 * POST /admin/variants body for a changed SKU/MRP/price/purchase price, or null
 * when nothing changed. The variant's existing bulk tiers, attributes, weight
 * and image are always sent back because the endpoint overwrites them.
 */
export function variantUpsertBody(v: AdminVariantRow, e: VariantEdit): VariantUpsertBody | null {
  const sku = e.sku.trim();
  const mrp = toPaise(e.mrp);
  const sellingPrice = toPaise(e.price);
  const costPrice = e.cost.trim() === '' ? null : toPaise(e.cost);
  if (
    sku === v.sku &&
    mrp === v.mrp &&
    sellingPrice === v.sellingPrice &&
    costPrice === (v.costPrice ?? null)
  ) {
    return null;
  }
  return {
    id: v.id,
    productId: v.productId,
    sku,
    mrp,
    sellingPrice,
    attributes: v.attributesJson ?? {},
    weightGrams: v.weightGrams,
    // Echoed back so a price/stock edit never clears the weight + unit.
    weightValue: v.weightValue ?? null,
    weightUnit: isWeightUnit(v.weightUnit) ? v.weightUnit : null,
    imageUrl: v.imageUrl ?? undefined,
    priceSlabs: v.priceSlabsJson ?? [],
    costPrice,
  };
}

export { pickAttr };

/** Highest quantity the cart allows per line (keep in sync with MAX_CART_QTY in @belzo/shared). */
const MAX_ORDER_QTY = 99;

/** "" -> null (no limit), a whole number -> that number, anything else -> NaN. */
export function parseOrderLimit(s: string | undefined): number | null {
  const v = (s ?? '').trim();
  if (v === '') return null;
  return /^\d+$/.test(v) ? Number(v) : Number.NaN;
}

/** A problem with the min/max order quantity inputs, or null when they are fine (both optional). */
export function validateOrderLimits(minQty: string, maxQty: string): string | null {
  const min = parseOrderLimit(minQty);
  const max = parseOrderLimit(maxQty);
  for (const [label, v] of [['Min', min], ['Max', max]] as const) {
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > MAX_ORDER_QTY)) {
      return `${label} order quantity must be a whole number from 1 to ${MAX_ORDER_QTY} (or blank for no limit).`;
    }
  }
  if (min !== null && max !== null && min > max) return 'Min order quantity cannot be more than the max.';
  return null;
}

/**
 * PATCH /admin/variants/:id/order-limits body when the typed min/max differ from what is saved, else null.
 * Kept apart from the variant upsert so changing a limit never rewrites price, tiers, weight or image.
 */
export function orderLimitsBody(
  v: AdminVariantRow,
  e: VariantEdit,
): { minOrderQty: number | null; maxOrderQty: number | null } | null {
  const minOrderQty = parseOrderLimit(e.minQty);
  const maxOrderQty = parseOrderLimit(e.maxQty);
  if (minOrderQty === (v.minOrderQty ?? null) && maxOrderQty === (v.maxOrderQty ?? null)) return null;
  return { minOrderQty, maxOrderQty };
}

/**
 * Variant attributes after editing Size/Color: every other key (e.g. "Pack Of")
 * is kept, any Size/Color/Colour key (case-insensitive) is replaced by the
 * trimmed non-blank values given.
 */
export function mergeVariantAttrs(
  existing: Record<string, string> | null | undefined,
  size: string,
  color: string,
): Record<string, string> {
  const replaced = new Set(['size', 'color', 'colour']);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(existing ?? {})) {
    if (!replaced.has(k.toLowerCase())) out[k] = val;
  }
  if (size.trim()) out.Size = size.trim();
  if (color.trim()) out.Color = color.trim();
  return out;
}

/** Result of DELETE /admin/variants/:id: hard delete, or hidden + kept for order history. */
export type RemoveVariantMode = 'deleted' | 'deactivated';

/** Human label for a variant: "500 ml (OIL-500)", "M / Black (TS-M-BLK)", or just the SKU. */
export function variantLabel(
  attrs: Record<string, string> | null | undefined,
  sku: string,
): string {
  const parts = [pickAttr(attrs, 'size'), pickAttr(attrs, 'color', 'colour')].filter(Boolean);
  return parts.length ? `${parts.join(' / ')} (${sku})` : sku;
}

export function removeVariantConfirmText(label: string): string {
  return `Remove variant "${label}"? If it was ever ordered it is hidden and kept for order history; otherwise it is deleted permanently.`;
}

export function removeVariantSuccessMessage(label: string, mode: RemoveVariantMode): string {
  return mode === 'deleted'
    ? `Removed "${label}" (deleted).`
    : `Removed "${label}" — it was ordered before, so it is hidden from the store and kept for order history.`;
}

/** Inventory adjustment needed to reach the typed stock (target - current). */
export function stockDelta(v: AdminVariantRow, e: VariantEdit): number {
  return parseInt(e.stock, 10) - (v.inventory?.available ?? 0);
}
