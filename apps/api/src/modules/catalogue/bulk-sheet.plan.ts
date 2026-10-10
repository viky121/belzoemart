/**
 * Bulk Excel sheet — pure planner and export mapping (design §6b, §7).
 *
 * `planProductGroup` validates one product group (a Parent row and/or its
 * Child rows) against the already-loaded DB state and returns a diff-only
 * write plan plus per-row issues. `toSheetExportRows` maps a product to the
 * sheet rows the export writes. Both are synchronous and side-effect free;
 * BulkSheetService does every DB read and write.
 */
import {
  INT_MAX,
  PACK_OF_MAX,
  SHEET_FIELD_MAX,
  buildTierSlabs,
  columnLabel,
  exclusiveToInclusive,
  parseGstRate,
  parseKgToGrams,
  parseNonNegInt,
  parsePercent,
  parseRupeesToPaise,
  parseTaxType,
  parseText,
  stableStringify,
  tier1Percent,
  tierPercentsFromSlabs,
  type SheetExportRow,
  type SheetGroup,
  type SheetIssue,
  type SheetKey,
  type SheetParseResult,
  type SheetPriceSlab,
  type SheetRowInput,
  type SheetTierPercents,
} from '@belzo/shared';
import { matchCategory, type CategoryRef } from './category-match';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Attrs = Record<string, string>;

/** Target product as loaded by the service (images by position, brand name). */
export interface PlanProduct {
  id: string;
  sku: string | null;
  title: string;
  description: string;
  categoryId: string;
  brandId: string | null;
  hsnCode: string;
  taxRatePct: number;
  attributesJson: unknown;
  images: { url: string; alt: string; position: number }[];
  brand: { id: string; name: string } | null;
  /** Number of active variants (single-row "other active variants" rule). */
  activeVariantCount: number;
}

/** Existing variant of any product, keyed by SKU in `variantsBySku`. */
export interface PlanVariant {
  id: string;
  productId: string;
  sku: string;
  mrp: number;
  sellingPrice: number;
  costPrice: number | null;
  weightGrams: number;
  attributesJson: unknown;
  priceSlabsJson: unknown;
  imageUrl: string | null;
  isActive: boolean;
  inventory: { available: number } | null;
  product: { id: string; sku: string | null; title: string };
}

export interface PlanContext {
  /** Target product; null when the group creates a new product. */
  product: PlanProduct | null;
  variantsBySku: ReadonlyMap<string, PlanVariant>;
  allCats: readonly CategoryRef[];
  /** Saved or derived Parent SKU of a product (undefined when not known). */
  parentSkuOf: (productId: string) => string | undefined;
  /** New variant SKU -> title of the other product that has it as its Parent SKU. */
  parentSkuClash: ReadonlyMap<string, string>;
  /** Unit named by the uploaded Weight header (NIT 5). */
  weightUnitHint?: 'g' | 'kg' | null;
}

export interface ProductFieldsPlan {
  title?: string;
  description?: string;
  categoryId?: string;
  hsnCode?: string;
  taxRatePct?: number;
  attributesJson?: Attrs;
}

export interface ProductCreatePlan {
  title: string;
  description: string;
  categoryId: string;
  hsnCode: string;
  taxRatePct: number;
  attributesJson: Attrs;
}

export interface VariantUpdateData {
  mrp?: number;
  sellingPrice?: number;
  costPrice?: number;
  weightGrams?: number;
  imageUrl?: string;
  attributesJson?: Attrs;
  priceSlabsJson?: SheetPriceSlab[];
  isActive?: true;
}

export type VariantPlan =
  | {
      kind: 'create';
      row: number;
      sku: string;
      data: {
        sku: string;
        mrp: number;
        sellingPrice: number;
        costPrice: number | null;
        weightGrams: number;
        attributesJson: Attrs;
        priceSlabsJson: SheetPriceSlab[];
        imageUrl: string | null;
      };
      /** Opening stock (0 when blank). */
      stock: number;
    }
  | {
      kind: 'update';
      row: number;
      sku: string;
      variantId: string;
      /** Only the fields whose value changes; empty = no update call. */
      data: VariantUpdateData;
      /** Stock from the sheet; null = blank (unchanged). */
      stock: number | null;
    };

export interface ProductPlan {
  key: string;
  /** Existing product id; null when `create` is set. */
  productId: string | null;
  create: ProductCreatePlan | null;
  /** Changed product fields (existing product only). */
  data: ProductFieldsPlan;
  /** Brand name to find-or-create and set; null = unchanged. */
  brandName: string | null;
  /** Save `sku = key` on an existing product whose sku is null. */
  saveSku: boolean;
  /** New gallery (ordered URLs); null = unchanged. */
  gallery: string[] | null;
  variants: VariantPlan[];
  /** Rows written by this plan (Parent row + planned variant rows), for "Not saved". */
  rows: { row: number; sku: string }[];
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

/** Sentinel for mergeAttr: remove every matching key (Pack Of = 1). */
export const REMOVE_ATTR: unique symbol = Symbol('remove-attr');

const SIZE_SET = ['size'] as const;
const COLOUR_SET = ['colour', 'color'] as const;
const PACK_SET = ['pack of'] as const;
const DIMENSIONS_SET = ['dimensions', 'dimension'] as const;

function matchingKeys(attrs: Attrs, matchSet: readonly string[]): string[] {
  return Object.keys(attrs).filter((k) => matchSet.includes(k.trim().toLowerCase()));
}

function sameAttrValue(stored: unknown, value: string, numeric: boolean): boolean {
  const a = String(stored ?? '').trim();
  if (numeric && /^\d+$/.test(a) && /^\d+$/.test(value)) return Number(a) === Number(value);
  return a === value;
}

/**
 * One merge rule for Size, Color, Pack Of and Dimensions (§6b):
 * - value null (blank cell): unchanged;
 * - REMOVE_ATTR: every matching key removed;
 * - a match already holds the same trimmed value: unchanged (keys keep their case);
 * - otherwise every match is removed and `attrs[canonical] = value`.
 * Returns a new object when something changes, else `attrs` itself.
 */
export function mergeAttr(
  attrs: Attrs,
  canonical: string,
  matchSet: readonly string[],
  value: string | typeof REMOVE_ATTR | null,
  opts: { numeric?: boolean } = {},
): Attrs {
  if (value === null) return attrs;
  const matches = matchingKeys(attrs, matchSet);
  if (value === REMOVE_ATTR) {
    if (matches.length === 0) return attrs;
    const out = { ...attrs };
    for (const k of matches) delete out[k];
    return out;
  }
  const v = value.trim();
  if (matches.some((k) => sameAttrValue(attrs[k], v, opts.numeric ?? false))) return attrs;
  const out = { ...attrs };
  for (const k of matches) delete out[k];
  out[canonical] = v;
  return out;
}

/** Some matching key holds `x` (trimmed). */
function holds(attrs: Attrs, matchSet: readonly string[], x: string): boolean {
  return matchingKeys(attrs, matchSet).some((k) => sameAttrValue(attrs[k], x, false));
}

function hasAttr(attrs: Attrs, matchSet: readonly string[]): boolean {
  return matchingKeys(attrs, matchSet).length > 0;
}

/** Shallow copy of a stored attributesJson (non-objects -> {}). */
function toAttrs(json: unknown): Attrs {
  if (json && typeof json === 'object' && !Array.isArray(json)) return { ...(json as Attrs) };
  return {};
}

/** Trimmed value of the first attribute whose key (case-insensitive) is one of `keys`, else ''. */
export function pickAttr(json: unknown, ...keys: string[]): string {
  const attrs = toAttrs(json);
  for (const [k, v] of Object.entries(attrs)) {
    if (keys.includes(k.trim().toLowerCase())) return String(v ?? '').trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Cells that only make sense for a variant (Tier 1 is reference only, never read). */
const VARIANT_ONLY_KEYS: readonly SheetKey[] = [
  'mrp',
  'sellingPrice',
  'purchasePrice',
  'stock',
  'size',
  'weightKg',
  'packOf',
  'tier2',
  'tier3',
  'tier4',
  'tier5',
];
const IMAGE_KEYS = ['image1', 'image2', 'image3', 'image4', 'image5'] as const;
const TIER_KEYS = ['tier2', 'tier3', 'tier4', 'tier5'] as const;
const NUMERIC_BRAND = /^\d+(\.\d+)?$/;
const GST_LIST_MESSAGE = 'GST Rate must be one of 0%, 5%, 12%, 18%, 28%';

function cell(r: SheetRowInput | undefined, k: SheetKey): string {
  return (r?.[k] ?? '').trim();
}

/** Any variant-only cell (prices, stock, size, weight, Pack Of, tiers 2–5) is filled. */
export function hasVariantCells(r: SheetRowInput): boolean {
  return VARIANT_ONLY_KEYS.some((k) => cell(r, k) !== '');
}

/** A link (`http(s)://…`) or an app path (`/…`), as bulkUpsert accepts. */
export function isUrlRef(s: string): boolean {
  return /^https?:\/\//.test(s) || s.startsWith('/');
}

function dedup(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Paise -> '849' / '857.22' for messages. */
function rupees(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

function asSlabs(json: unknown): SheetPriceSlab[] | null {
  return Array.isArray(json) ? (json as SheetPriceSlab[]) : null;
}

function parsePackOf(s: string | undefined): SheetParseResult<number> {
  const r = parseNonNegInt(s, columnLabel('packOf'), PACK_OF_MAX);
  if (!r.ok) {
    return /too large/.test(r.error) ? r : { ok: false, error: 'Pack Of must be a whole number of 1 or more' };
  }
  if (r.value === 0) return { ok: false, error: 'Pack Of must be a whole number of 1 or more' };
  return r;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Plan one product group (design §6b, plus round-3 Finding 1 and NIT 5).
 * A null plan means nothing of the group is written; the issues explain why.
 * Plan warnings describe changes, so the service reports them only on commit.
 */
export function planProductGroup(
  group: SheetGroup,
  ctx: PlanContext,
): { plan: ProductPlan | null; issues: SheetIssue[] } {
  const P = group.key;
  const product = ctx.product;
  const parent = group.parent;
  const children = group.children;
  const issues: SheetIssue[] = [];
  const add = (row: number, sku: string, level: 'error' | 'warning', message: string): void => {
    issues.push({ row, sku, level, message });
  };
  const rowSku = (r: SheetRowInput): string => (r.sku ?? '').trim();

  // Single-row form: a Parent row without Child rows that is the variant `sku = P`.
  const singleRow = !!parent && children.length === 0 && (product === null || hasVariantCells(parent));

  let pAttrs: Attrs = toAttrs(product?.attributesJson);
  const productData: ProductFieldsPlan = {};
  let create: ProductCreatePlan | null = null;
  let brandName: string | null = null;
  let parentTax: 'inclusive' | 'exclusive' | null = null;
  // parentGst: the product's rate after this import; gstForExclusive: the rate an
  // Exclusive Selling Price is converted with (undefined = none available).
  let parentGst: number | undefined = product?.taxRatePct;
  let gstForExclusive: number | undefined = product?.taxRatePct;
  let parentImgs: string[] = [];
  let singleRowColour: string | null = null;

  // ---- Parent row --------------------------------------------------------
  if (parent) {
    const pe: string[] = [];
    const pw: string[] = [];
    let newTitle = '';
    let newCategoryId = '';
    let newDescription = '';
    let newHsn = '';
    let newGst = 0;

    const title = parseText(parent.title, SHEET_FIELD_MAX.title, columnLabel('title'));
    if (!title.ok) pe.push(title.error);
    else if (title.value === null) {
      if (!product) pe.push('Title is required for a new product');
    } else if (!product) newTitle = title.value;
    else if (title.value !== product.title.trim()) productData.title = title.value;

    const cat = parseText(parent.finalDetail, SHEET_FIELD_MAX.finalDetail, columnLabel('finalDetail'));
    if (!cat.ok) pe.push(cat.error);
    else if (cat.value === null) {
      if (!product) pe.push('Final detail (category) is required for a new product');
    } else {
      const m = matchCategory(cat.value, ctx.allCats);
      if ('error' in m) pe.push(m.error);
      else if (!product) newCategoryId = m.ok.id;
      else if (m.ok.id !== product.categoryId) productData.categoryId = m.ok.id;
    }

    const desc = parseText(parent.description, SHEET_FIELD_MAX.description, columnLabel('description'));
    if (!desc.ok) pe.push(desc.error);
    else if (desc.value !== null) {
      if (!product) newDescription = desc.value;
      else if (desc.value !== product.description.trim()) productData.description = desc.value;
    }

    // Brand: the parent cell unless blank or numeric, else the first child with one.
    const brandCell = cell(parent, 'brand');
    const usableBrand = (s: string): boolean => s !== '' && !NUMERIC_BRAND.test(s);
    let chosenBrand: string | null = null;
    let brandRow: number | null = null;
    if (usableBrand(brandCell)) chosenBrand = brandCell;
    else {
      const from = children.find((c) => usableBrand(cell(c, 'brand')));
      if (from) {
        chosenBrand = cell(from, 'brand');
        brandRow = from.row;
      }
    }
    if (brandCell !== '' && NUMERIC_BRAND.test(brandCell)) {
      pw.push(
        chosenBrand !== null
          ? `Brand "${brandCell}" looks like a number and was ignored — using "${chosenBrand}" from row ${brandRow}.`
          : `Brand "${brandCell}" looks like a number and was ignored.`,
      );
    }
    if (chosenBrand !== null) {
      if (chosenBrand.length > SHEET_FIELD_MAX.brand) {
        pe.push(`${columnLabel('brand')} is longer than ${SHEET_FIELD_MAX.brand} characters`);
      } else if (product?.brand?.name.trim().toLowerCase() !== chosenBrand.toLowerCase()) {
        brandName = chosenBrand;
      }
    }

    // HSN: whitespace-insensitive compare; the 4/6/8-digit hint only when written.
    const hsn = (parent.hsnCode ?? '').replace(/\s+/g, '');
    if (hsn !== '') {
      if (hsn.length > 12) pe.push('HSN Code must be 12 characters or fewer');
      else if (!product || hsn !== product.hsnCode.replace(/\s+/g, '')) {
        if (!product) newHsn = hsn;
        else productData.hsnCode = hsn;
        if (!/^(\d{4}|\d{6}|\d{8})$/.test(hsn)) pw.push('HSN Code usually has 4, 6 or 8 digits.');
      }
    }

    // GST.
    const gstCell = cell(parent, 'gstRate');
    if (gstCell === '') {
      if (!product) {
        pw.push('GST Rate is blank — saved as 0%.');
        newGst = 0;
        parentGst = 0;
        gstForExclusive = undefined;
      }
    } else {
      const g = parseGstRate(gstCell);
      if (g.ok && g.value !== null) {
        parentGst = g.value;
        gstForExclusive = g.value;
        if (!product) newGst = g.value;
        else if (g.value !== product.taxRatePct) productData.taxRatePct = g.value;
      } else {
        const pct = parsePercent(gstCell, columnLabel('gstRate'));
        if (product && pct.ok && pct.value !== null && Math.abs(pct.value - product.taxRatePct) < 1e-9) {
          pw.push(`GST Rate ${product.taxRatePct}% is not a standard rate — kept as it is.`);
        } else {
          pe.push(g.ok ? GST_LIST_MESSAGE : g.error);
        }
      }
    }

    // Gallery images.
    const imgs: string[] = [];
    IMAGE_KEYS.forEach((k, i) => {
      const v = cell(parent, k);
      if (v === '') return;
      if (!isUrlRef(v)) pe.push(`image ${i + 1} is not a link or a selected file`);
      else imgs.push(v);
    });
    parentImgs = dedup(imgs);

    const tt = parseTaxType(parent.taxType);
    if (!tt.ok) pe.push(tt.error);
    else parentTax = tt.value;

    const colour = parseText(parent.colour, SHEET_FIELD_MAX.colour, columnLabel('colour'));
    if (!colour.ok) pe.push(colour.error);
    else if (singleRow) singleRowColour = colour.value;
    else pAttrs = mergeAttr(pAttrs, 'Color', COLOUR_SET, colour.value);

    const dims = parseText(parent.dimensions, SHEET_FIELD_MAX.dimensions, columnLabel('dimensions'));
    if (!dims.ok) pe.push(dims.error);
    else pAttrs = mergeAttr(pAttrs, 'Dimensions', DIMENSIONS_SET, dims.value);

    if (children.length > 0 && hasVariantCells(parent)) {
      pw.push('Prices, stock, size, weight, Pack Of and tiers on a Parent row with Child rows are ignored.');
    }

    if (singleRow) {
      const own = ctx.variantsBySku.get(P);
      if (product && (!own || own.productId !== product.id) && product.activeVariantCount > 0) {
        pe.push(
          `Parent row has prices but no Child rows, and SKU ${P} isn't a variant of this product — add Child rows for its variants.`,
        );
      }
      if (!product && (cell(parent, 'mrp') === '' || cell(parent, 'sellingPrice') === '')) {
        pe.push('New product needs MRP and Selling Price on the Parent row, or Child rows');
      }
    }

    if (pe.length > 0) {
      for (const m of pe) add(parent.row, P, 'error', m);
      for (const c of children) {
        add(c.row, rowSku(c), 'error', `Not imported: Parent row ${parent.row} has errors.`);
      }
      return { plan: null, issues };
    }
    for (const m of pw) add(parent.row, P, 'warning', m);

    if (!product) {
      create = {
        title: newTitle,
        description: newDescription,
        categoryId: newCategoryId,
        hsnCode: newHsn,
        taxRatePct: newGst,
        attributesJson: {},
      };
    }
  }

  // ---- Variant rows ------------------------------------------------------
  const variantRows: SheetRowInput[] = singleRow && parent ? [parent] : children;
  // A new product with a Parent row but no Parent images builds its gallery from the children.
  const childGallery = !!parent && !product && parentImgs.length === 0;
  const childImages: string[] = [];
  const variants: VariantPlan[] = [];
  const plannedRows: { row: number; sku: string }[] = parent ? [{ row: parent.row, sku: P }] : [];

  for (const r of variantRows) {
    const sku = singleRow ? P : rowSku(r);
    const errs: string[] = [];
    const warns: string[] = [];
    const V = ctx.variantsBySku.get(sku);

    if (V && (!product || V.productId !== product.id)) {
      const q = ctx.parentSkuOf(V.productId) ?? V.product.sku ?? '';
      errs.push(`SKU ${sku} already belongs to another product (Parent SKU ${q} / "${V.product.title}").`);
    }
    if (!V) {
      const clash = ctx.parentSkuClash.get(sku);
      if (clash !== undefined) errs.push(`SKU ${sku} is the Parent SKU of "${clash}" — use a different SKU.`);
    }

    const mrp = parseRupeesToPaise(r.mrp, columnLabel('mrp'));
    const sp = parseRupeesToPaise(r.sellingPrice, columnLabel('sellingPrice'));
    const cost = parseRupeesToPaise(r.purchasePrice, columnLabel('purchasePrice'));
    const stock = parseNonNegInt(r.stock, columnLabel('stock'));
    const weight = parseKgToGrams(r.weightKg);
    const pack = parsePackOf(r.packOf);
    const size = parseText(r.size, SHEET_FIELD_MAX.size, columnLabel('size'));
    const colour = singleRow
      ? ({ ok: true, value: singleRowColour } as const)
      : parseText(r.colour, SHEET_FIELD_MAX.colour, columnLabel('colour'));
    for (const res of [mrp, sp, cost, stock, weight, pack, size, colour]) if (!res.ok) errs.push(res.error);

    const tiers: SheetTierPercents = { tier2: null, tier3: null, tier4: null, tier5: null };
    TIER_KEYS.forEach((k, i) => {
      const t = parsePercent(r[k], columnLabel(k));
      if (!t.ok) errs.push(t.error);
      else if (t.value !== null) {
        if (t.value < 0 || t.value > 95) errs.push(`Bulk Tier ${i + 2} must be between 0% and 95%`);
        else tiers[k] = t.value;
      }
    });

    let img1: string | null = null;
    const extraImgs: string[] = [];
    if (!singleRow) {
      for (let i = 0; i < IMAGE_KEYS.length; i++) {
        const v = cell(r, IMAGE_KEYS[i]!);
        if (v === '') continue;
        if (!isUrlRef(v)) errs.push(`image ${i + 1} is not a link or a selected file`);
        else if (i === 0) img1 = v;
        else extraImgs.push(v);
      }
    }

    const rowTax = singleRow ? ({ ok: true, value: parentTax } as const) : parseTaxType(r.taxType);
    if (!rowTax.ok) errs.push(rowTax.error);
    const taxType = (rowTax.ok ? rowTax.value : null) ?? parentTax ?? 'inclusive';

    // NIT 5: grams under a `Weight (g)` header are an error, not just a warning.
    if (weight.ok && weight.value !== null && weight.value > 50_000) {
      const raw = cell(r, 'weightKg');
      if (ctx.weightUnitHint === 'g') {
        errs.push(`Weight is in kg — ${raw} looks like grams; enter ${Number(raw) / 1000} (e.g. 0.2)`);
      } else {
        warns.push(`Weight is in kg — ${weight.value / 1000} kg looks too high.`);
      }
    }

    // GST used to convert this row's Exclusive Selling Price.
    let gstForRow = gstForExclusive;
    if (!singleRow) {
      const gc = cell(r, 'gstRate');
      if (parent) {
        if (gc !== '') {
          const pct = parsePercent(gc, columnLabel('gstRate'));
          if (pct.ok && pct.value !== null && parentGst !== undefined && Math.abs(pct.value - parentGst) > 1e-9) {
            warns.push(`GST Rate on Child rows is ignored — the Parent row's ${parentGst}% is used.`);
          }
        }
      } else if (taxType === 'exclusive' && product && gc !== '') {
        const g = parseGstRate(gc);
        let rate: number | null = null;
        if (g.ok && g.value !== null) rate = g.value;
        else {
          const pct = parsePercent(gc, columnLabel('gstRate'));
          if (pct.ok && pct.value !== null && Math.abs(pct.value - product.taxRatePct) < 1e-9) {
            rate = product.taxRatePct;
          }
        }
        if (rate === null) errs.push(g.ok ? GST_LIST_MESSAGE : g.error);
        else {
          gstForRow = rate;
          if (rate !== product.taxRatePct) {
            warns.push(
              `GST Rate ${rate}% is used only to convert this Exclusive price — the product's GST stays ${product.taxRatePct}%.`,
            );
          }
        }
      }
    }

    let spValue = sp.ok ? sp.value : null;
    let converted = false;
    if (errs.length === 0 && taxType === 'exclusive' && spValue !== null) {
      if (gstForRow === undefined) errs.push('GST Rate is needed to convert an Exclusive price.');
      else {
        spValue = exclusiveToInclusive(spValue, gstForRow);
        converted = true;
        if (spValue > INT_MAX) errs.push('Selling Price is too large.');
      }
    }

    const mrpF = (mrp.ok ? mrp.value : null) ?? V?.mrp;
    const spF = spValue ?? V?.sellingPrice;
    if (errs.length === 0) {
      if (mrpF === undefined || spF === undefined) {
        errs.push('MRP and Selling Price are required for a new variant.');
      } else if (spF > mrpF) {
        errs.push(
          `Selling Price ₹${rupees(spF)}${converted ? ' (incl. GST)' : ''} is more than MRP ₹${rupees(mrpF)}.`,
        );
      }
    }

    if (errs.length > 0 || mrpF === undefined || spF === undefined) {
      if (singleRow && parent) {
        // The Parent row is the variant: its errors fail the whole group.
        for (const m of errs) add(parent.row, P, 'error', m);
        return { plan: null, issues };
      }
      for (const m of errs) add(r.row, sku, 'error', m);
      continue;
    }

    const costValue = cost.ok ? cost.value : null;
    const plannedCost = costValue ?? V?.costPrice ?? null;
    if (plannedCost !== null && plannedCost > spF) warns.push('purchasing price is above the Selling Price.');

    // Slabs.
    const stored = V ? asSlabs(V.priceSlabsJson) : [];
    let slabs: SheetPriceSlab[] | null = stored;
    const anyTier = TIER_KEYS.some((k) => tiers[k] !== null);
    let keep = true;
    if (anyTier && mrpF === 0) {
      warns.push('Bulk tiers need an MRP — tiers skipped');
    } else if (anyTier) {
      const res = buildTierSlabs(mrpF, spF, tiers);
      if (res.mode === 'replace') {
        keep = false;
        slabs = res.slabs;
        warns.push(...res.warnings);
      }
    }
    if (keep && stored) {
      slabs = stored.filter((s) => {
        if (s.unitPrice > spF) {
          warns.push(
            `Existing bulk tier at ${s.minQty}+ units (₹${rupees(s.unitPrice)}) is above the new Selling Price and was removed.`,
          );
          return false;
        }
        return true;
      });
    }

    // Attributes.
    const sizeValue = size.ok ? size.value : null;
    const colourValue = colour.ok ? colour.value : null;
    let vAttrs = toAttrs(V?.attributesJson);
    if (singleRow) {
      // Finding 1: wizard-made single-variant products keep Size/Color on both levels.
      const s = sizeValue;
      if (s !== null) {
        const unchanged = holds(vAttrs, SIZE_SET, s) || (!hasAttr(vAttrs, SIZE_SET) && holds(pAttrs, SIZE_SET, s));
        if (!unchanged) {
          vAttrs = mergeAttr(vAttrs, 'Size', SIZE_SET, s);
          if (hasAttr(pAttrs, SIZE_SET)) pAttrs = mergeAttr(pAttrs, 'Size', SIZE_SET, s);
        }
      }
      const c = colourValue;
      if (c !== null) {
        const unchanged =
          holds(pAttrs, COLOUR_SET, c) || (!hasAttr(pAttrs, COLOUR_SET) && holds(vAttrs, COLOUR_SET, c));
        if (!unchanged) {
          pAttrs = mergeAttr(pAttrs, 'Color', COLOUR_SET, c);
          if (hasAttr(vAttrs, COLOUR_SET)) vAttrs = mergeAttr(vAttrs, 'Color', COLOUR_SET, c);
        }
      }
    } else {
      vAttrs = mergeAttr(vAttrs, 'Size', SIZE_SET, sizeValue);
      vAttrs = mergeAttr(vAttrs, 'Color', COLOUR_SET, colourValue);
    }
    if (pack.ok && pack.value !== null) {
      vAttrs = mergeAttr(vAttrs, 'Pack Of', PACK_SET, pack.value > 1 ? String(pack.value) : REMOVE_ATTR, {
        numeric: true,
      });
    }

    // Images on Child rows.
    if (!singleRow) {
      if (childGallery) {
        if (img1 !== null) childImages.push(img1);
        childImages.push(...extraImgs);
      } else if (extraImgs.length > 0) {
        warns.push("image 2–5 on Child rows are only used to build a new product's gallery — ignored.");
      }
    }

    const weightValue = weight.ok ? weight.value : null;
    const stockValue = stock.ok ? stock.value : null;
    if (!V) {
      variants.push({
        kind: 'create',
        row: r.row,
        sku,
        data: {
          sku,
          mrp: mrpF,
          sellingPrice: spF,
          costPrice: costValue,
          weightGrams: weightValue ?? 0,
          attributesJson: vAttrs,
          priceSlabsJson: slabs ?? [],
          imageUrl: img1,
        },
        stock: stockValue ?? 0,
      });
    } else {
      const data: VariantUpdateData = {};
      if (mrpF !== V.mrp) data.mrp = mrpF;
      if (spF !== V.sellingPrice) data.sellingPrice = spF;
      if (costValue !== null && costValue !== V.costPrice) data.costPrice = costValue;
      if (weightValue !== null && weightValue !== V.weightGrams) data.weightGrams = weightValue;
      if (img1 !== null && img1 !== V.imageUrl) data.imageUrl = img1;
      if (stableStringify(vAttrs) !== stableStringify(V.attributesJson ?? {})) data.attributesJson = vAttrs;
      if (slabs !== null && stableStringify(slabs) !== stableStringify(V.priceSlabsJson ?? [])) {
        data.priceSlabsJson = slabs;
      }
      if (V.isActive === false) data.isActive = true;
      variants.push({ kind: 'update', row: r.row, sku, variantId: V.id, data, stock: stockValue });
    }
    for (const m of warns) add(r.row, sku, 'warning', m);
    if (!singleRow) plannedRows.push({ row: r.row, sku });
  }

  if (!product && variants.length === 0 && parent) {
    add(parent.row, P, 'error', 'Product not created — none of its variant rows are valid');
    return { plan: null, issues };
  }

  // ---- Gallery -----------------------------------------------------------
  let gallery: string[] | null = null;
  if (parent) {
    let candidate: string[] | null = null;
    if (parentImgs.length > 0) candidate = parentImgs;
    else if (childGallery && childImages.length > 0) {
      const all = dedup(childImages);
      if (all.length > 10) add(parent.row, P, 'warning', 'Only the first 10 images are kept.');
      candidate = all.slice(0, 10);
    }
    if (candidate) {
      const existing = dedup(
        [...(product?.images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url),
      );
      const noop =
        sameList(candidate, existing) ||
        (candidate.length === 5 && existing.length > 5 && sameList(candidate, existing.slice(0, 5)));
      if (!noop) gallery = candidate;
    }
  }

  if (create) create.attributesJson = pAttrs;
  else if (product && stableStringify(pAttrs) !== stableStringify(product.attributesJson ?? {})) {
    productData.attributesJson = pAttrs;
  }

  return {
    plan: {
      key: P,
      productId: product?.id ?? null,
      create,
      data: productData,
      brandName,
      saveSku: !!product && product.sku === null,
      gallery,
      variants,
      rows: plannedRows,
    },
    issues,
  };
}

// ---------------------------------------------------------------------------
// Export mapping (§7)
// ---------------------------------------------------------------------------

export interface ExportVariant {
  sku: string;
  mrp: number;
  sellingPrice: number;
  costPrice: number | null;
  weightGrams: number;
  attributesJson: unknown;
  priceSlabsJson: unknown;
  imageUrl: string | null;
  inventory: { available: number } | null;
}

export interface ExportProduct {
  title: string;
  description: string;
  hsnCode: string;
  taxRatePct: number;
  attributesJson: unknown;
  brand: { name: string } | null;
  images: { url: string; position: number }[];
  /** Active variants, oldest first. */
  variants: ExportVariant[];
}

const EXPORT_KEYS: readonly SheetKey[] = [
  'indicator',
  'parentSku',
  'sku',
  'finalDetail',
  'brand',
  'title',
  'description',
  'colour',
  'size',
  'weightKg',
  'hsnCode',
  'taxType',
  'gstRate',
  'mrp',
  'sellingPrice',
  'purchasePrice',
  'stock',
  'packOf',
  'tier1',
  'tier2',
  'tier3',
  'tier4',
  'tier5',
  'image1',
  'image2',
  'image3',
  'image4',
  'image5',
  'dimensions',
];

function blankExportRow(indicator: 'Parent' | 'Child', sku: string): SheetExportRow {
  const row = {} as Record<SheetKey, string | number | null>;
  for (const k of EXPORT_KEYS) row[k] = null;
  return { ...(row as unknown as SheetExportRow), indicator, sku };
}

/** Text for a cell: blank when empty or longer than the column allows (blank keeps it on import). */
function fit(v: string | null | undefined, key: SheetKey): string | null {
  if (v === null || v === undefined || v === '') return null;
  return v.length > SHEET_FIELD_MAX[key] ? null : v;
}

/** 1 when no Pack Of key, the integer for a stored 2..PACK_OF_MAX, else blank. */
function exportPackOf(json: unknown): number | null {
  const attrs = toAttrs(json);
  const k = Object.keys(attrs).find((x) => x.trim().toLowerCase() === 'pack of');
  if (k === undefined) return 1;
  const v = String(attrs[k] ?? '').trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= 2 && n <= PACK_OF_MAX ? n : null;
}

/**
 * Map one product to its sheet rows: a single Parent row carrying the prices
 * when it has exactly one active variant whose SKU equals the Parent SKU,
 * else a Parent row plus one Child row per active variant.
 */
export function toSheetExportRows(
  product: ExportProduct,
  parentSku: string,
  categoryLabel: string,
): SheetExportRow[] {
  const productFields = (r: SheetExportRow): void => {
    r.finalDetail = fit(categoryLabel, 'finalDetail');
    r.brand = fit(product.brand?.name, 'brand');
    r.description = fit(product.description, 'description');
    r.hsnCode = fit(product.hsnCode, 'hsnCode');
    r.taxType = 'Inclusive';
    r.gstRate = `${product.taxRatePct}%`;
  };

  const variantFields = (r: SheetExportRow, v: ExportVariant): void => {
    r.weightKg = v.weightGrams ? v.weightGrams / 1000 : null;
    r.mrp = v.mrp / 100;
    r.sellingPrice = v.sellingPrice / 100;
    r.purchasePrice = v.costPrice === null ? null : v.costPrice / 100;
    r.stock = v.inventory?.available ?? 0;
    r.packOf = exportPackOf(v.attributesJson);
    r.tier1 = tier1Percent(v.mrp, v.sellingPrice);
    const tiers = tierPercentsFromSlabs(v.mrp, v.sellingPrice, asSlabs(v.priceSlabsJson) ?? []);
    if (tiers) {
      r.tier2 = tiers.tier2;
      r.tier3 = tiers.tier3;
      r.tier4 = tiers.tier4;
      r.tier5 = tiers.tier5;
    }
  };

  const gallery = (r: SheetExportRow): void => {
    const urls = dedup(
      [...product.images].sort((a, b) => a.position - b.position).map((i) => i.url),
    ).slice(0, 5);
    // All-or-nothing: a partly blank image set would replace the gallery on import.
    if (urls.some((u) => u.length > SHEET_FIELD_MAX.image1)) return;
    IMAGE_KEYS.forEach((k, i) => {
      r[k] = urls[i] ?? null;
    });
  };

  const parentRow = blankExportRow('Parent', parentSku);
  productFields(parentRow);
  parentRow.title = fit(product.title, 'title');
  parentRow.dimensions = fit(pickAttr(product.attributesJson, 'dimensions', 'dimension'), 'dimensions');
  gallery(parentRow);

  const [only] = product.variants;
  if (product.variants.length === 1 && only && only.sku === parentSku) {
    parentRow.size = fit(
      pickAttr(only.attributesJson, 'size') || pickAttr(product.attributesJson, 'size'),
      'size',
    );
    parentRow.colour = fit(
      pickAttr(product.attributesJson, 'color', 'colour') ||
        pickAttr(only.attributesJson, 'color', 'colour'),
      'colour',
    );
    variantFields(parentRow, only);
    return [parentRow];
  }

  parentRow.colour = fit(pickAttr(product.attributesJson, 'color', 'colour'), 'colour');
  const rows: SheetExportRow[] = [parentRow];
  for (const v of product.variants) {
    const r = blankExportRow('Child', v.sku);
    r.parentSku = parentSku;
    productFields(r);
    const size = pickAttr(v.attributesJson, 'size');
    const colour = pickAttr(v.attributesJson, 'color', 'colour');
    const label = [size, colour, pickAttr(v.attributesJson, 'pack of')].filter((x) => x !== '').join(' / ');
    r.title = `${product.title} - ${label || v.sku}`.slice(0, SHEET_FIELD_MAX.title);
    r.size = fit(size, 'size');
    r.colour = fit(colour, 'colour');
    r.image1 = fit(v.imageUrl, 'image1');
    variantFields(r, v);
    rows.push(r);
  }
  return rows;
}
