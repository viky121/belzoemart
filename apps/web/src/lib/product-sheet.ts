/**
 * Pure helpers for the bulk product sheet upload (no React/DOM, no exceljs):
 * the CSV reader, header → row mapping shared with the .xlsx reader, image
 * file assignment, request chunking, issue merging and 429 retry.
 * Format rules live in @belzo/shared (bulk-sheet.ts).
 */
import type { HeaderMapping, SheetCellKind, SheetGroup, SheetIssue, SheetRowInput } from '@belzo/shared';
import { parseCsvTable } from './csv';
import { OLD_FORMAT_MESSAGE, SHEET_COLUMNS, mapHeaderRow } from './shared-bulk-sheet';

export interface ParsedSheet {
  rows: SheetRowInput[];
  issues: SheetIssue[];
  fatal?: string;
  /** Unit named by the weight header ('Weight (g)' -> 'g'); sent as `weightUnit` on import. */
  weightUnitHint: 'g' | 'kg' | null;
}

export const MAX_SHEET_ROWS = 5000;
export const NO_SKU_COLUMN_MESSAGE =
  "This file doesn't look like the Belzo product template — no SKU column found.";

export function tooManyRowsMessage(n: number): string {
  return (
    `Too many rows (${n}). Upload at most 5,000 rows at a time — split the file, ` +
    "keeping each product's Parent and Child rows in the same file."
  );
}

const IMAGE_KEYS = ['image1', 'image2', 'image3', 'image4', 'image5'] as const;

// ---------------------------------------------------------------------------
// Header + row mapping (shared by the CSV and .xlsx readers)
// ---------------------------------------------------------------------------

export interface SheetHeader {
  mapping: HeaderMapping;
  issues: SheetIssue[];
  fatal?: string;
}

/** Map row 1: old-format / no-SKU fatals, and warnings for ignored or repeated columns. */
export function readSheetHeader(headers: string[]): SheetHeader {
  const mapping = mapHeaderRow(headers);
  if (mapping.oldFormat) return { mapping, issues: [], fatal: OLD_FORMAT_MESSAGE };
  if (!mapping.index.has('sku')) return { mapping, issues: [], fatal: NO_SKU_COLUMN_MESSAGE };
  const issues: SheetIssue[] = [];
  if (mapping.unknown.length > 0) {
    issues.push({ row: 1, sku: '', level: 'warning', message: `Ignored columns: ${mapping.unknown.join(', ')}` });
  }
  for (const d of mapping.duplicates) {
    issues.push({ row: 1, sku: '', level: 'warning', message: `Column ${d} appears twice — the first one is used.` });
  }
  return { mapping, issues };
}

/**
 * Build one SheetRowInput from a data row. `read(col, kind)` returns the cell
 * text of 0-based column `col`. Blank cells are left out; an all-blank row gives null.
 */
export function toSheetRow(
  row: number,
  mapping: HeaderMapping,
  read: (col: number, kind: SheetCellKind) => string,
): SheetRowInput | null {
  const out: SheetRowInput = { row };
  let any = false;
  for (const c of SHEET_COLUMNS) {
    const col = mapping.index.get(c.key);
    if (col === undefined) continue;
    const v = read(col, c.kind).trim();
    if (v === '') continue;
    out[c.key] = v;
    any = true;
  }
  return any ? out : null;
}

/** Final ParsedSheet with the 5,000-row cap applied. */
export function finishSheet(rows: SheetRowInput[], header: SheetHeader): ParsedSheet {
  const weightUnitHint = header.mapping.weightUnitHint;
  if (rows.length > MAX_SHEET_ROWS) {
    return { rows: [], issues: [], fatal: tooManyRowsMessage(rows.length), weightUnitHint };
  }
  return { rows, issues: header.issues, weightUnitHint };
}

/** Read a CSV saved from the template (record 1 = header; record N = row N). */
export function readProductCsv(text: string): ParsedSheet {
  const table = parseCsvTable(text);
  const header = readSheetHeader(table[0] ?? []);
  if (header.fatal) {
    return { rows: [], issues: [], fatal: header.fatal, weightUnitHint: header.mapping.weightUnitHint };
  }
  const rows: SheetRowInput[] = [];
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i]!;
    const r = toSheetRow(i + 1, header.mapping, (col) => cells[col] ?? '');
    if (r) rows.push(r);
  }
  return finishSheet(rows, header);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** An image cell that is already a usable link (vs. a selected file name). */
export function isUrlRef(s: string): boolean {
  return /^https?:\/\//i.test(s) || s.startsWith('/');
}

/** Non-blank image1..5 values of a row, in order. */
export function imageRefs(row: SheetRowInput): string[] {
  const out: string[] = [];
  for (const k of IMAGE_KEYS) {
    const v = (row[k] ?? '').trim();
    if (v) out.push(v);
  }
  return out;
}

const baseName = (name: string): string => name.replace(/\.[^.]+$/, '');

/**
 * Files named after a SKU (TSHIRT-001.jpg, TSHIRT-001-2.jpg, TSHIRT-001_back.png).
 * Each file goes to the LONGEST matching SKU; within a SKU the exact-name file
 * comes first, then the rest by name. Keys are lower-cased trimmed SKUs.
 */
export function assignSkuFiles(fileKeys: string[], skus: string[]): Map<string, string[]> {
  const lowered = [...new Set(skus.map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, string[]>();
  for (const file of fileKeys) {
    const base = baseName(file);
    let best: string | undefined;
    for (const s of lowered) {
      if (base === s || base.startsWith(`${s}-`) || base.startsWith(`${s}_`)) {
        if (!best || s.length > best.length) best = s;
      }
    }
    if (!best) continue;
    const list = out.get(best) ?? [];
    list.push(file);
    out.set(best, list);
  }
  for (const [s, list] of out) {
    list.sort((a, b) => {
      const ea = baseName(a) === s;
      const eb = baseName(b) === s;
      if (ea !== eb) return ea ? -1 : 1;
      return a.localeCompare(b);
    });
  }
  return out;
}

/** Result of resolving one non-URL image ref: an uploaded URL, an error, or undefined (not selected). */
export type ImageResolution = string | { error: string } | undefined;

/** Replace file-name refs in image1..5 with uploaded URLs; the first unresolved ref is an error. */
export function applyResolvedImages(
  row: SheetRowInput,
  resolve: (ref: string) => ImageResolution,
): { row: SheetRowInput } | { error: string } {
  const next: SheetRowInput = { ...row };
  for (const k of IMAGE_KEYS) {
    const ref = (row[k] ?? '').trim();
    if (!ref || isUrlRef(ref)) continue;
    const r = resolve(ref);
    if (typeof r === 'string') next[k] = r;
    else if (r) return { error: r.error };
    else return { error: `image file "${ref}" was not selected in step 2` };
  }
  return { row: next };
}

// ---------------------------------------------------------------------------
// Request chunking
// ---------------------------------------------------------------------------

/** Child rows: drop title/description (ignored by the server) to keep requests small. */
export function slimChildRow(row: SheetRowInput): SheetRowInput {
  const rest: SheetRowInput = { ...row };
  delete rest.title;
  delete rest.description;
  return rest;
}

/** Server DTO cap on rows per request. */
const DTO_MAX_ROWS = 1000;
const OVERSIZE_MESSAGE =
  'This product has too many rows to import at once (max 1,000 rows / 900 KB) — split its Child rows into separate uploads.';

const encoder = new TextEncoder();
const jsonBytes = (v: unknown): number => encoder.encode(JSON.stringify(v)).length;
/** Bytes of `{"rows":[]}`. */
const WRAPPER_BYTES = jsonBytes({ rows: [] });

/**
 * Pack whole groups into request chunks of at most `maxRows` rows and
 * `maxBytes` JSON bytes. A group over the limits goes alone (up to 1,000 rows
 * / maxBytes); a bigger one is not sent and each of its rows gets an error.
 */
export function chunkGroups(
  groups: SheetGroup[],
  opts: { maxRows: number; maxBytes: number } = { maxRows: 400, maxBytes: 900_000 },
): { chunks: SheetRowInput[][]; issues: SheetIssue[] } {
  const chunks: SheetRowInput[][] = [];
  const issues: SheetIssue[] = [];
  let current: SheetRowInput[] = [];
  let currentBytes = WRAPPER_BYTES;

  const flush = (): void => {
    if (current.length > 0) chunks.push(current);
    current = [];
    currentBytes = WRAPPER_BYTES;
  };

  for (const g of groups) {
    const rows = [...(g.parent ? [g.parent] : []), ...g.children.map(slimChildRow)].sort((a, b) => a.row - b.row);
    if (rows.length === 0) continue;
    const rowBytes = rows.reduce((n, r) => n + jsonBytes(r), 0) + (rows.length - 1); // + commas
    const aloneBytes = WRAPPER_BYTES + rowBytes;

    if (rows.length > DTO_MAX_ROWS || aloneBytes > opts.maxBytes) {
      for (const r of rows) {
        issues.push({ row: r.row, sku: (r.sku ?? '').trim(), level: 'error', message: OVERSIZE_MESSAGE });
      }
      continue;
    }
    if (rows.length > opts.maxRows) {
      flush();
      chunks.push(rows);
      continue;
    }
    const joinedBytes = currentBytes + rowBytes + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && (current.length + rows.length > opts.maxRows || joinedBytes > opts.maxBytes)) {
      flush();
    }
    currentBytes += rowBytes + (current.length > 0 ? 1 : 0);
    current.push(...rows);
  }
  flush();
  return { chunks, issues };
}

// ---------------------------------------------------------------------------
// Issues, file name, retry, messages
// ---------------------------------------------------------------------------

/** Concatenate issue lists, de-duplicated by row|level|message, sorted by row (stable). */
export function mergeIssues(a: SheetIssue[], b: SheetIssue[]): SheetIssue[] {
  const seen = new Set<string>();
  const out: SheetIssue[] = [];
  for (const i of [...a, ...b]) {
    const k = `${i.row}|${i.level}|${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out.sort((x, y) => x.row - y.row);
}

/** belzo-products-YYYY-MM-DD.xlsx (local date). */
export function productsXlsxFilename(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `belzo-products-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
}

/**
 * Fixed wait after an HTTP 429 (the throttler window is 60 s; Retry-After is
 * not readable here because ApiClientError carries no headers and CORS does
 * not expose it).
 */
export const THROTTLE_WAIT_SECONDS = 60;

/** Run fn; on a throttled error wait 60 s and retry once. A second failure is rethrown. */
export async function withThrottleRetry<T>(
  fn: () => Promise<T>,
  isThrottled: (e: unknown) => boolean,
  wait: (seconds: number) => Promise<void>,
  onWait?: (seconds: number) => void,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isThrottled(e)) throw e;
    onWait?.(THROTTLE_WAIT_SECONDS);
    await wait(THROTTLE_WAIT_SECONDS);
    return fn();
  }
}

/**
 * Row message for a failed chunk request. Network errors (no status) and 5xx
 * may have committed on the server, so they say re-uploading is safe.
 */
export function chunkFailureMessage(message: string, status?: number): string {
  const base = `Import request failed: ${message}`;
  if (status !== undefined && status < 500) return base;
  return `${base}. Some of these rows may have been saved — uploading the same file again is safe.`;
}
