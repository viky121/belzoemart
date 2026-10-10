/**
 * Bulk product sheet (one Excel format for download + upload).
 *
 * Pure format logic shared by the web client and the API: columns, header
 * matching, cell parsers, Parent/Child grouping, bulk-tier math, GST
 * Exclusive conversion and parent-SKU derivation.
 *
 * IMPORTANT: this module must have NO module-scope side effects so it
 * tree-shakes out of storefront bundles (it is re-exported from index.ts).
 * The top level holds only literal consts, types, functions and one lazy
 * `let` cache. webpack's side-effect analysis treats array/object literal
 * initialisers as impure, so those consts are built by `/*#__PURE__*\/`
 * annotated arrow IIFEs (same values, no other effect). Keep that pattern
 * for any new array/object const. It also imports NOTHING: webpack treats a module as having
 * side effects when any module it imports does (money.ts computes
 * ZERO_MONEY at load), which would keep this file in every chunk that
 * holds the index. Rupee -> paise therefore uses the local `toPaise`, the
 * same arithmetic as money.ts rupeesToMoney (a spec pins them together).
 */

/** rupeesToMoney's arithmetic for a finite input: normalise to 6 decimals, round half-up. */
function toPaise(rupees: number): number {
  return Math.round(Number((rupees * 100).toFixed(6)));
}

export type SheetKey =
  | 'indicator'
  | 'parentSku'
  | 'sku'
  | 'finalDetail'
  | 'brand'
  | 'title'
  | 'description'
  | 'colour'
  | 'size'
  | 'weightKg'
  | 'hsnCode'
  | 'taxType'
  | 'gstRate'
  | 'mrp'
  | 'sellingPrice'
  | 'purchasePrice'
  | 'stock'
  | 'packOf'
  | 'tier1'
  | 'tier2'
  | 'tier3'
  | 'tier4'
  | 'tier5'
  | 'image1'
  | 'image2'
  | 'image3'
  | 'image4'
  | 'image5'
  | 'dimensions';

export type SheetCellKind = 'text' | 'sku' | 'money' | 'percent' | 'int' | 'kg' | 'list' | 'image';

export interface SheetColumn {
  key: SheetKey;
  header: string;
  width: number;
  kind: SheetCellKind;
}

export const SHEET_NAME = 'Products';

/** The 29 template columns, in order. Header text is byte-for-byte FR-1. */
export const SHEET_COLUMNS: readonly SheetColumn[] = /*#__PURE__*/ ((): readonly SheetColumn[] => [
  { key: 'indicator', header: 'Parent/Child Indicator', width: 14, kind: 'list' },
  { key: 'parentSku', header: 'Parent SKU', width: 16, kind: 'sku' },
  { key: 'sku', header: 'SKU', width: 18, kind: 'sku' },
  { key: 'finalDetail', header: 'Final detail', width: 22, kind: 'list' },
  { key: 'brand', header: 'Brand', width: 14, kind: 'text' },
  { key: 'title', header: 'Title', width: 36, kind: 'text' },
  { key: 'description', header: 'Description', width: 48, kind: 'text' },
  { key: 'colour', header: 'Colour', width: 10, kind: 'text' },
  { key: 'size', header: 'Size', width: 10, kind: 'text' },
  { key: 'weightKg', header: 'Weight (kg)', width: 11, kind: 'kg' },
  { key: 'hsnCode', header: 'HSN Code', width: 12, kind: 'sku' },
  { key: 'taxType', header: 'Tax Type (Dropdown: Inclusive/Exclusive)', width: 16, kind: 'list' },
  { key: 'gstRate', header: 'GST Rate (Dropdown: 0%/5%/12%/18%/28%)', width: 14, kind: 'list' },
  { key: 'mrp', header: 'MRP (INR)', width: 11, kind: 'money' },
  { key: 'sellingPrice', header: 'Selling Price (INR)', width: 13, kind: 'money' },
  { key: 'purchasePrice', header: 'purchasing price', width: 13, kind: 'money' },
  { key: 'stock', header: 'Quantity/Stock', width: 12, kind: 'int' },
  { key: 'packOf', header: 'Pack Of', width: 9, kind: 'int' },
  { key: 'tier1', header: 'Bulk Tier 1 (1-4 units) Discount %', width: 14, kind: 'percent' },
  { key: 'tier2', header: 'Bulk Tier 2 (5-8 units) Discount %', width: 14, kind: 'percent' },
  { key: 'tier3', header: 'Bulk Tier 3 (9-12 units) Discount %', width: 14, kind: 'percent' },
  { key: 'tier4', header: 'Bulk Tier 4 (13-20 units) Discount %', width: 14, kind: 'percent' },
  { key: 'tier5', header: 'Bulk Tier 5 (21+ units) Discount %', width: 14, kind: 'percent' },
  { key: 'image1', header: 'image 1 (main image )', width: 30, kind: 'image' },
  { key: 'image2', header: 'image 2', width: 30, kind: 'image' },
  { key: 'image3', header: 'image 3', width: 30, kind: 'image' },
  { key: 'image4', header: 'image 4', width: 30, kind: 'image' },
  { key: 'image5', header: 'image 5', width: 30, kind: 'image' },
  { key: 'dimensions', header: 'dimention (LWH)', width: 16, kind: 'text' },
])();

/** Max characters per cell, shared by the client pre-check, groupSheetRows and the API DTO. */
export const SHEET_FIELD_MAX: Readonly<Record<SheetKey, number>> = /*#__PURE__*/ ((): Readonly<
  Record<SheetKey, number>
> => ({
  indicator: 20,
  gstRate: 20,
  hsnCode: 20,
  weightKg: 30,
  mrp: 30,
  sellingPrice: 30,
  purchasePrice: 30,
  stock: 30,
  packOf: 30,
  tier1: 30,
  tier2: 30,
  tier3: 30,
  tier4: 30,
  tier5: 30,
  taxType: 40,
  parentSku: 60,
  sku: 60,
  finalDetail: 200,
  brand: 200,
  title: 200,
  colour: 200,
  size: 200,
  dimensions: 200,
  image1: 2048,
  image2: 2048,
  image3: 2048,
  image4: 2048,
  image5: 2048,
  description: 5000,
}))();

export const GST_RATES = /*#__PURE__*/ (() => [0, 5, 12, 18, 28] as const)();
export const TIER_MIN_QTY = /*#__PURE__*/ (() => ({ tier2: 5, tier3: 9, tier4: 13, tier5: 21 }) as const)();
export const EXAMPLE_SKU_PREFIX = 'EXAMPLE-';
/** Postgres INTEGER max. */
export const INT_MAX = 2_147_483_647;
export const PACK_OF_MAX = 10_000;
/** normHeader() values written only by the removed 12-column CSV format. */
export const OLD_FORMAT_HEADERS = /*#__PURE__*/ (
  () => ['categoryslug', 'taxratepct', 'imageurl', 'status'] as const
)();
export const OLD_FORMAT_MESSAGE =
  'This is the old CSV format. Click "⬇ Download Excel", copy your rows into that file and upload it.';

export type SheetRowInput = { row: number } & Partial<Record<SheetKey, string>>;

export interface SheetIssue {
  row: number;
  sku: string;
  level: 'error' | 'warning';
  message: string;
}

export interface SheetGroup {
  key: string;
  parent?: SheetRowInput;
  children: SheetRowInput[];
}

export interface SheetImportResult {
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  issues: SheetIssue[];
}

/** One sheet row as produced by the export. Money = rupees, weightKg = kg, stock/packOf = integers,
 *  tier1..5 = percent (e.g. 22 or 18.0018), everything else = text; null = blank cell. */
export type SheetExportRow = {
  [K in SheetKey]: K extends
    | 'mrp'
    | 'sellingPrice'
    | 'purchasePrice'
    | 'weightKg'
    | 'stock'
    | 'packOf'
    | 'tier1'
    | 'tier2'
    | 'tier3'
    | 'tier4'
    | 'tier5'
    ? number | null
    : string | null;
} & { indicator: 'Parent' | 'Child'; sku: string };

export interface SheetCategoryOption {
  label: string;
  slug: string;
  path: string;
}

export interface SheetExport {
  rows: SheetExportRow[];
  categories: SheetCategoryOption[];
}

export interface SheetPriceSlab {
  minQty: number;
  unitPrice: number;
}

export type SheetParseResult<T> = { ok: true; value: T | null } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Key-order-insensitive JSON
// ---------------------------------------------------------------------------

/** JSON.stringify with object keys sorted recursively; array order is kept. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) out[k] = src[k];
      return out;
    }
    return value;
  });
}

// ---------------------------------------------------------------------------
// Header matching
// ---------------------------------------------------------------------------

/** Alias table: normHeader() value -> key. Turned into a Map lazily (no module-scope side effects). */
const HEADER_ALIASES: Readonly<Record<SheetKey, readonly string[]>> = /*#__PURE__*/ ((): Readonly<
  Record<SheetKey, readonly string[]>
> => ({
  indicator: ['parentchildindicator', 'indicator', 'parentchild', 'type'],
  parentSku: ['parentsku'],
  sku: ['sku'],
  finalDetail: ['finaldetail', 'category'],
  brand: ['brand'],
  title: ['title'],
  description: ['description'],
  colour: ['colour', 'color'],
  size: ['size'],
  weightKg: ['weight', 'weightkg', 'weightg'],
  hsnCode: ['hsncode', 'hsn'],
  taxType: ['taxtype'],
  gstRate: ['gstrate', 'gst'],
  mrp: ['mrp', 'mrpinr'],
  sellingPrice: ['sellingprice', 'sellingpriceinr'],
  purchasePrice: ['purchasingprice', 'purchaseprice', 'costprice'],
  stock: ['quantitystock', 'quantity', 'stock'],
  packOf: ['packof'],
  tier1: ['bulktier1discount', 'bulktier1'],
  tier2: ['bulktier2discount', 'bulktier2'],
  tier3: ['bulktier3discount', 'bulktier3'],
  tier4: ['bulktier4discount', 'bulktier4'],
  tier5: ['bulktier5discount', 'bulktier5'],
  image1: ['image1', 'image1mainimage'],
  image2: ['image2', 'image2mainimage'],
  image3: ['image3', 'image3mainimage'],
  image4: ['image4', 'image4mainimage'],
  image5: ['image5', 'image5mainimage'],
  dimensions: ['dimention', 'dimension', 'dimensions', 'dimentionlwh', 'dimensionslwh'],
}))();

let aliasMap: Map<string, SheetKey> | null = null;

function getAliasMap(): Map<string, SheetKey> {
  if (!aliasMap) {
    const m = new Map<string, SheetKey>();
    for (const key of Object.keys(HEADER_ALIASES) as SheetKey[]) {
      for (const alias of HEADER_ALIASES[key]) m.set(alias, key);
    }
    aliasMap = m;
  }
  return aliasMap;
}

/** BOM strip, drop every ( … ) group (incl. an unclosed trailing one), lower-case, keep a-z0-9. */
export function normHeader(raw: string): string {
  return (raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\([^)]*(\)|$)/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function canonicalHeader(raw: string): SheetKey | null {
  return getAliasMap().get(normHeader(raw)) ?? null;
}

/** Column header with every ( … ) group removed and whitespace collapsed, e.g. 'Bulk Tier 2 Discount %'. */
export function columnLabel(key: SheetKey): string {
  const col = SHEET_COLUMNS.find((c) => c.key === key);
  const header = col ? col.header : key;
  return header
    .replace(/\([^)]*(\)|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HeaderMapping {
  index: Map<SheetKey, number>;
  unknown: string[];
  duplicates: string[];
  oldFormat: boolean;
  /** Unit named by the header mapped to weightKg ('Weight (g)' -> 'g'); null when it names none. */
  weightUnitHint: 'g' | 'kg' | null;
}

function weightUnitOf(raw: string): 'g' | 'kg' | null {
  const n = normHeader(raw);
  if (n === 'weightg' || /\(\s*g\s*\)|\bgrams?\b/i.test(raw)) return 'g';
  if (n === 'weightkg' || /\(\s*kgs?\s*\)/i.test(raw)) return 'kg';
  return null;
}

/** Map a header row; the first occurrence of each key wins. */
export function mapHeaderRow(headers: string[]): HeaderMapping {
  const index = new Map<SheetKey, number>();
  const unknown: string[] = [];
  const duplicates: string[] = [];
  let sawOldHeader = false;
  let weightUnitHint: 'g' | 'kg' | null = null;
  const oldHeaders: readonly string[] = OLD_FORMAT_HEADERS;

  for (let i = 0; i < headers.length; i++) {
    const raw = headers[i] ?? '';
    if (oldHeaders.includes(normHeader(raw))) sawOldHeader = true;
    const key = canonicalHeader(raw);
    if (!key) {
      if (raw.trim() !== '') unknown.push(raw.trim());
      continue;
    }
    if (index.has(key)) {
      duplicates.push(raw.trim());
      continue;
    }
    index.set(key, i);
    if (key === 'weightKg') weightUnitHint = weightUnitOf(raw);
  }

  return {
    index,
    unknown,
    duplicates,
    oldFormat: !index.has('indicator') && sawOldHeader,
    weightUnitHint,
  };
}

// ---------------------------------------------------------------------------
// Cell parsers. Blank / whitespace-only -> { ok: true, value: null }.
// ---------------------------------------------------------------------------

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const INT_RE = /^\d+$/;
const NEGATIVE_RE = /^-\d/;

function blank(s: string | null | undefined): boolean {
  return s == null || s.trim() === '';
}

export function parseText(
  s: string | null | undefined,
  max: number,
  column = 'Value',
): SheetParseResult<string> {
  if (blank(s)) return { ok: true, value: null };
  const v = (s as string).trim();
  if (v.length > max) return { ok: false, error: `${column} is longer than ${max} characters` };
  return { ok: true, value: v };
}

/** Rupees text ('₹ 1,099.50', '799 INR', '799/-') -> integer paise. */
export function parseRupeesToPaise(s: string | null | undefined, column: string): SheetParseResult<number> {
  if (blank(s)) return { ok: true, value: null };
  const v = (s as string)
    .trim()
    .replace(/^(₹|rs\.?|inr)\s*/i, '')
    .replace(/\s*(inr|rs\.?|\/-)$/i, '')
    .replace(/[,\s]/g, '');
  if (NEGATIVE_RE.test(v)) return { ok: false, error: `${column} cannot be negative` };
  if (!DECIMAL_RE.test(v)) {
    return { ok: false, error: `${column} must be a number in rupees, e.g. 799 or 799.50` };
  }
  const n = Number(v);
  // Guard before converting so huge inputs (even Infinity) are "too large", never a throw.
  if (!Number.isFinite(n) || n > INT_MAX / 100 + 1) return { ok: false, error: `${column} is too large` };
  const amount = toPaise(n);
  if (amount > INT_MAX) return { ok: false, error: `${column} is too large` };
  return { ok: true, value: amount };
}

/** '20%', '20' and Excel's fraction 0.2 all mean 20. Range checks are the caller's. */
export function parsePercent(s: string | null | undefined, column: string): SheetParseResult<number> {
  if (blank(s)) return { ok: true, value: null };
  let v = (s as string).trim();
  const hasPct = /\s*%$/.test(v);
  if (hasPct) v = v.replace(/\s*%$/, '');
  if (NEGATIVE_RE.test(v)) return { ok: false, error: `${column} cannot be negative` };
  if (!DECIMAL_RE.test(v)) return { ok: false, error: `${column} must be a percentage, e.g. 20%` };
  const n = Number(v);
  if (hasPct) return { ok: true, value: n };
  if (n > 0 && n < 1) return { ok: true, value: Number((n * 100).toPrecision(12)) };
  return { ok: true, value: n };
}

export function parseGstRate(s: string | null | undefined): SheetParseResult<number> {
  const listError = 'GST Rate must be one of 0%, 5%, 12%, 18%, 28%';
  const p = parsePercent(s, columnLabel('gstRate'));
  if (!p.ok) return { ok: false, error: listError };
  if (p.value === null) return p;
  const value = p.value;
  const rate = GST_RATES.find((r) => Math.abs(r - value) < 1e-9);
  if (rate === undefined) return { ok: false, error: listError };
  return { ok: true, value: rate };
}

export function parseTaxType(s: string | null | undefined): SheetParseResult<'inclusive' | 'exclusive'> {
  if (blank(s)) return { ok: true, value: null };
  const v = (s as string).trim().toLowerCase();
  if (v.startsWith('incl')) return { ok: true, value: 'inclusive' };
  if (v.startsWith('excl')) return { ok: true, value: 'exclusive' };
  return { ok: false, error: 'Tax Type must be Inclusive or Exclusive' };
}

export function parseIndicator(s: string | null | undefined): SheetParseResult<'parent' | 'child'> {
  if (blank(s)) return { ok: true, value: null };
  const v = (s as string).trim().toLowerCase();
  if (v === 'parent' || v === 'p') return { ok: true, value: 'parent' };
  if (v === 'child' || v === 'c' || v === 'variant') return { ok: true, value: 'child' };
  return { ok: false, error: 'Parent/Child Indicator must be Parent or Child' };
}

export function parseNonNegInt(
  s: string | null | undefined,
  column: string,
  max: number = INT_MAX,
): SheetParseResult<number> {
  if (blank(s)) return { ok: true, value: null };
  const v = (s as string).replace(/[,\s]/g, '');
  if (NEGATIVE_RE.test(v)) return { ok: false, error: `${column} cannot be negative` };
  if (!INT_RE.test(v)) return { ok: false, error: `${column} must be a whole number (0 or more)` };
  const n = Number(v);
  if (n > max) return { ok: false, error: `${column} is too large (max ${max})` };
  return { ok: true, value: n };
}

/** kg text ('0.25', '0.85 kg') -> integer grams. */
export function parseKgToGrams(s: string | null | undefined): SheetParseResult<number> {
  if (blank(s)) return { ok: true, value: null };
  const v = (s as string).trim().replace(/\s*kgs?$/i, '');
  if (NEGATIVE_RE.test(v)) return { ok: false, error: 'Weight cannot be negative' };
  if (!DECIMAL_RE.test(v)) return { ok: false, error: 'Weight must be a number in kg, e.g. 0.25' };
  const grams = Math.round(Number(v) * 1000);
  if (!Number.isFinite(grams) || grams > INT_MAX) return { ok: false, error: 'Weight is too large' };
  return { ok: true, value: grams };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

interface Candidate {
  input: SheetRowInput;
  role: 'parent' | 'child';
  key: string;
  sku: string;
}

/**
 * Group sheet rows into products (design §3, steps 1–9). SKU comparisons are
 * exact (case-sensitive) after trimming; only the EXAMPLE- prefix test ignores case.
 */
export function groupSheetRows(rows: SheetRowInput[]): { groups: SheetGroup[]; issues: SheetIssue[] } {
  const allKeys = SHEET_COLUMNS.map((c) => c.key);
  const issues: SheetIssue[] = [];
  const candidates: Candidate[] = [];
  const validParents = new Map<string, number>(); // parent sku -> row
  const failedParents = new Map<string, number>(); // parent sku -> row

  const issue = (row: number, sku: string, level: 'error' | 'warning', message: string): void => {
    issues.push({ row, sku, level, message });
  };

  // Pass 1: steps 1–5.
  for (const r of rows) {
    const sku = (r.sku ?? '').trim();
    const parentSku = (r.parentSku ?? '').trim();

    // 1. Blank and example rows.
    if (allKeys.every((k) => blank(r[k]))) continue;
    if (sku.toUpperCase().startsWith(EXAMPLE_SKU_PREFIX)) {
      issue(r.row, sku, 'warning', 'Example row skipped — delete it or replace it with a real product.');
      continue;
    }

    // 2. Indicator (NIT 10: blank + parentSku equal to sku is a Parent row).
    const ind = parseIndicator(r.indicator);
    if (!ind.ok) {
      issue(r.row, sku, 'error', ind.error);
      continue;
    }
    const role: 'parent' | 'child' =
      ind.value ?? (parentSku === '' || parentSku === sku ? 'parent' : 'child');

    // 3. Length limits (title/description are not checked on Child rows).
    let tooLong = false;
    for (const k of allKeys) {
      if (role === 'child' && (k === 'title' || k === 'description')) continue;
      const v = r[k];
      if (v != null && v.length > SHEET_FIELD_MAX[k]) {
        issue(r.row, sku, 'error', `${columnLabel(k)} is longer than ${SHEET_FIELD_MAX[k]} characters`);
        tooLong = true;
      }
    }
    if (tooLong) {
      if (role === 'parent' && sku !== '' && !failedParents.has(sku)) failedParents.set(sku, r.row);
      continue;
    }

    // 4. SKU required.
    if (sku === '') {
      issue(r.row, sku, 'error', 'SKU is required');
      continue;
    }

    // 5. Keys.
    if (role === 'parent') {
      const earlier = validParents.get(sku);
      if (earlier !== undefined) {
        issue(r.row, sku, 'error', `Parent SKU ${sku} is already used in row ${earlier}`);
        continue;
      }
      if (parentSku !== '' && parentSku !== sku) {
        issue(
          r.row,
          sku,
          'warning',
          `Parent SKU on a Parent row is ignored — its SKU (${sku}) is the Parent SKU.`,
        );
      }
      validParents.set(sku, r.row);
      candidates.push({ input: r, role, key: sku, sku });
    } else {
      if (parentSku === '') {
        issue(r.row, sku, 'error', 'Parent SKU is required on Child rows');
        continue;
      }
      candidates.push({ input: r, role, key: parentSku, sku });
    }
  }

  // Pass 2: steps 6–8.
  // 6. Cascade children of Parent rows that failed in pass 1.
  const survivors: Candidate[] = [];
  for (const c of candidates) {
    if (c.role === 'child' && !validParents.has(c.key)) {
      const failedRow = failedParents.get(c.key);
      if (failedRow !== undefined) {
        issue(c.input.row, c.sku, 'error', `Not imported: Parent row ${failedRow} has errors.`);
        continue;
      }
    }
    survivors.push(c);
  }

  // Group key -> row that names it (the Parent row, else the first Child row).
  const groupKeyRow = new Map<string, number>();
  const keysWithChildren = new Set<string>();
  for (const c of survivors) {
    if (c.role === 'parent') groupKeyRow.set(c.key, c.input.row);
    else keysWithChildren.add(c.key);
  }
  for (const c of survivors) {
    if (!groupKeyRow.has(c.key)) groupKeyRow.set(c.key, c.input.row);
  }
  const parentsLower = new Map<string, { sku: string; row: number }>();
  for (const [psku, prow] of validParents) {
    const lower = psku.toLowerCase();
    if (!parentsLower.has(lower)) parentsLower.set(lower, { sku: psku, row: prow });
  }

  const seenSkus = new Map<string, number>();
  const groups = new Map<string, SheetGroup>();
  for (const c of survivors) {
    // 7. Variant-SKU uniqueness (child SKUs + single-row Parent SKUs).
    if (c.role === 'child') {
      if (c.sku !== c.key && groupKeyRow.has(c.sku)) {
        issue(c.input.row, c.sku, 'error', `SKU ${c.sku} is also a Parent SKU in row ${groupKeyRow.get(c.sku)}`);
        continue;
      }
    }
    if (c.role === 'child' || !keysWithChildren.has(c.key)) {
      const earlier = seenSkus.get(c.sku);
      if (earlier !== undefined) {
        issue(c.input.row, c.sku, 'error', `SKU ${c.sku} is already used in row ${earlier}`);
        continue;
      }
      seenSkus.set(c.sku, c.input.row);
    }

    // 8. Case-only near miss of a Parent row in the file.
    if (c.role === 'child' && !validParents.has(c.key)) {
      const near = parentsLower.get(c.key.toLowerCase());
      if (near) {
        issue(
          c.input.row,
          c.sku,
          'warning',
          `Parent SKU ${c.key} differs only in letter case from the Parent row ${near.row} (${near.sku}). SKUs are case-sensitive, so this row is not part of that product.`,
        );
      }
    }

    // 9. Groups in order of first appearance; children keep row order.
    let g = groups.get(c.key);
    if (!g) {
      g = { key: c.key, children: [] };
      groups.set(c.key, g);
    }
    if (c.role === 'parent') g.parent = c.input;
    else g.children.push(c.input);
  }

  return { groups: [...groups.values()], issues };
}

// ---------------------------------------------------------------------------
// Tier math, tax conversion
// ---------------------------------------------------------------------------

const TIER_KEYS = /*#__PURE__*/ (() => ['tier2', 'tier3', 'tier4', 'tier5'] as const)();

export type SheetTierKey = (typeof TIER_KEYS)[number];
export type SheetTierPercents = Record<SheetTierKey, number | null>;

/** Paise as a short rupee string for messages: 84900 -> '849', 85722 -> '857.22'. */
function rupeeText(amount: number): string {
  return amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2);
}

/**
 * Tiers 2–5 (% off MRP) -> price slabs. All blank -> keep the stored slabs.
 * The result is ascending by minQty and strictly decreasing below the Selling Price.
 */
export function buildTierSlabs(
  mrp: number,
  sellingPrice: number,
  tiers: SheetTierPercents,
): { mode: 'keep' } | { mode: 'replace'; slabs: SheetPriceSlab[]; warnings: string[] } {
  if (TIER_KEYS.every((k) => tiers[k] === null)) return { mode: 'keep' };
  const slabs: SheetPriceSlab[] = [];
  const warnings: string[] = [];
  let prev = sellingPrice;
  TIER_KEYS.forEach((k, i) => {
    const t = tiers[k];
    if (t === null) return;
    const n = i + 2;
    const price = Math.round((mrp * (100 - t)) / 100);
    if (price > sellingPrice) {
      warnings.push(
        `Bulk Tier ${n} (${t}% off MRP = ₹${rupeeText(price)}) is above the Selling Price ₹${rupeeText(sellingPrice)} — tier skipped`,
      );
    } else if (price >= prev) {
      warnings.push(
        `Bulk Tier ${n} (₹${rupeeText(price)}) is not lower than the previous price ₹${rupeeText(prev)} — tier skipped`,
      );
    } else {
      slabs.push({ minQty: TIER_MIN_QTY[k], unitPrice: price });
      prev = price;
    }
  });
  return { mode: 'replace', slabs, warnings };
}

/**
 * Stored slabs -> tier 2–5 percents (full precision), or null when the slabs
 * can't be represented by the 5 sheet tiers (export then leaves tiers blank).
 */
export function tierPercentsFromSlabs(
  mrp: number,
  sellingPrice: number,
  slabs: readonly SheetPriceSlab[],
): SheetTierPercents | null {
  if (mrp <= 0) return null;
  const out: SheetTierPercents = { tier2: null, tier3: null, tier4: null, tier5: null };
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
  let prev = sellingPrice;
  for (const s of sorted) {
    const k = TIER_KEYS.find((t) => TIER_MIN_QTY[t] === s.minQty);
    if (!k || out[k] !== null) return null;
    if (!(s.unitPrice < prev)) return null;
    const pct = (1 - s.unitPrice / mrp) * 100;
    if (pct > 95) return null;
    out[k] = pct;
    prev = s.unitPrice;
  }
  return out;
}

/** Tier 1 (reference only): % off MRP of the Selling Price. */
export function tier1Percent(mrp: number, sellingPrice: number): number | null {
  if (mrp <= 0) return null;
  return (1 - sellingPrice / mrp) * 100;
}

/** GST-exclusive paise -> GST-inclusive paise. */
export function exclusiveToInclusive(amount: number, gstPct: number): number {
  return Math.round((amount * (100 + gstPct)) / 100);
}

// ---------------------------------------------------------------------------
// Parent SKU derivation
// ---------------------------------------------------------------------------

export interface ParentSkuSource {
  id: string;
  slug: string;
  sku: string | null;
  activeSkus: string[];
  allSkus: string[];
}

function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0] as string;
  for (const v of values) {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

/**
 * productId -> parent SKU. Stored SKUs are kept; legacy products (null sku)
 * get a derived one. Callers order products by createdAt asc, id asc.
 */
export function assignParentSkus(products: readonly ParentSkuSource[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  const skuOwners = new Map<string, Set<string>>();
  for (const p of products) {
    for (const s of p.allSkus) {
      let owners = skuOwners.get(s);
      if (!owners) {
        owners = new Set<string>();
        skuOwners.set(s, owners);
      }
      owners.add(p.id);
    }
  }

  // Pass 1: stored parent SKUs are reserved.
  for (const p of products) {
    if (p.sku !== null) {
      result.set(p.id, p.sku);
      used.add(p.sku);
    }
  }

  const taken = (candidate: string, selfId: string): boolean => {
    if (used.has(candidate)) return true;
    const owners = skuOwners.get(candidate);
    if (!owners) return false;
    for (const id of owners) if (id !== selfId) return true;
    return false;
  };

  // Pass 2: derive for legacy products.
  for (const p of products) {
    if (p.sku !== null) continue;
    let chosen: string | null = null;
    if (p.activeSkus.length > 0) {
      const lcp = longestCommonPrefix(p.activeSkus).replace(/[-_/.\s]+$/, '');
      if (lcp.length >= 3 && lcp.length <= 60 && !taken(lcp, p.id)) chosen = lcp;
    }
    if (chosen === null) {
      const base = `P-${p.slug.slice(0, 40)}`.replace(/-+$/, '');
      chosen = taken(base, p.id) ? `${base}-${p.id.slice(0, 8)}` : base;
    }
    result.set(p.id, chosen);
    used.add(chosen);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Test / round-trip helper
// ---------------------------------------------------------------------------

/** Export row -> the strings the client sends (money/kg String(n), percents 'N%', null -> absent). */
export function exportRowToInput(r: SheetExportRow, row: number): SheetRowInput {
  const out: SheetRowInput = { row };
  for (const col of SHEET_COLUMNS) {
    const v = r[col.key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') {
      out[col.key] = col.kind === 'percent' ? `${Number(v.toPrecision(15))}%` : String(v);
    } else {
      out[col.key] = v;
    }
  }
  return out;
}
