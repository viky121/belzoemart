'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { SheetGroup, SheetImportResult, SheetIssue, SheetRowInput } from '@belzo/shared';
import { AdminUploadError, adminFetch, adminUpload } from '@/lib/admin-api';
import { ApiClientError } from '@/lib/api-client';
import {
  applyResolvedImages,
  assignSkuFiles,
  chunkFailureMessage,
  chunkGroups,
  imageRefs,
  isUrlRef,
  mergeIssues,
  readProductCsv,
  withThrottleRetry,
  type ImageResolution,
  type ParsedSheet,
} from '@/lib/product-sheet';
import { readProductWorkbook } from '@/lib/product-xlsx';
import { groupSheetRows } from '@/lib/shared-bulk-sheet';
import { ExcelDownloadButton } from '../excel-download-button';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SESSION_EXPIRED = 'Your admin session has expired. Please log in again and retry.';
const PREVIEW_ROWS = 15;
const IMAGE_KEYS = ['image1', 'image2', 'image3', 'image4', 'image5'] as const;

const sleep = (seconds: number): Promise<void> => new Promise((res) => setTimeout(res, seconds * 1000));
const lowerSku = (r: SheetRowInput): string => (r.sku ?? '').trim().toLowerCase();

interface ImportResult {
  productsCreated: number;
  productsUpdated: number;
  variantsSaved: number;
  issues: SheetIssue[];
}

/** Rows of a group in sheet order. */
const groupRows = (g: SheetGroup): SheetRowInput[] =>
  [...(g.parent ? [g.parent] : []), ...g.children].sort((a, b) => a.row - b.row);

/** Bulk product upload from the one Excel template (.xlsx, or CSV UTF-8 with the same headers). */
export default function BulkUploadPage() {
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  // Image files picked on this page, keyed by lower-cased file name. Sheet rows
  // reference them by name in image 1–5 (or by SKU-based file names).
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map());
  const [progress, setProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function addImageFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setImageFiles((prev) => {
      const next = new Map(prev);
      for (const f of files) next.set(f.name.toLowerCase(), f);
      return next;
    });
  }

  /**
   * Find the selected file for an image cell. Exact (case-insensitive) name
   * first; otherwise match on the name WITHOUT its extension when exactly one
   * selected file has it — so "photo.png" in the sheet still finds "photo.jpg".
   */
  function fileKeyFor(ref: string): string | undefined {
    const key = ref.trim().toLowerCase();
    if (imageFiles.has(key)) return key;
    const base = key.replace(/\.[^.]+$/, '');
    const hits = [...imageFiles.keys()].filter((k) => k.replace(/\.[^.]+$/, '') === base);
    return hits.length === 1 ? hits[0] : undefined;
  }

  // Rows with all five image cells blank take the files named after their SKU.
  const rows = useMemo<SheetRowInput[]>(() => {
    if (!parsed) return [];
    const assigned = assignSkuFiles(
      [...imageFiles.keys()],
      parsed.rows.map((r) => r.sku ?? ''),
    );
    return parsed.rows.map((r) => {
      if (imageRefs(r).length > 0) return r;
      const files = assigned.get(lowerSku(r));
      if (!files || files.length === 0) return r;
      const next: SheetRowInput = { ...r };
      files.slice(0, IMAGE_KEYS.length).forEach((f, i) => (next[IMAGE_KEYS[i]!] = f));
      return next;
    });
  }, [parsed, imageFiles]);

  const grouping = useMemo(() => groupSheetRows(rows), [rows]);

  const counts = useMemo(() => {
    let variants = 0;
    for (const g of grouping.groups) {
      if (g.children.length > 0) variants += g.children.length;
      else if (g.parent && (g.parent.mrp || g.parent.sellingPrice)) variants += 1;
    }
    return { products: grouping.groups.length, variants };
  }, [grouping]);

  const missingFiles = useMemo(() => {
    const out = new Set<string>();
    for (const r of rows) {
      for (const ref of imageRefs(r)) {
        if (!isUrlRef(ref) && !fileKeyFor(ref)) out.add(ref);
      }
    }
    return [...out];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, imageFiles]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseErr(null);
    setParsed(null);
    const name = file.name.toLowerCase();
    if (file.size > MAX_FILE_BYTES) {
      setParseErr('File is too large (max 10 MB).');
      return;
    }
    if (name.endsWith('.xls')) {
      setParseErr("Old .xls files aren't supported. In Excel choose File → Save As → Excel Workbook (.xlsx).");
      return;
    }
    try {
      const sheet = name.endsWith('.csv')
        ? readProductCsv(await file.text())
        : await readProductWorkbook(await file.arrayBuffer());
      if (sheet.fatal) {
        setParseErr(sheet.fatal);
        return;
      }
      setParsed(sheet);
    } catch {
      setParseErr('Could not read this file. Save it as .xlsx and try again.');
    }
  }

  async function importRows() {
    if (!parsed) return;
    setBusy(true);
    setResult(null);
    const clientIssues: SheetIssue[] = [...parsed.issues, ...grouping.issues];
    const totals = { productsCreated: 0, productsUpdated: 0, variantsSaved: 0 };
    let serverIssues: SheetIssue[] = [];
    try {
      // 1) Upload every image file referenced by rows that will be sent (each file once).
      const needed = new Set<string>();
      for (const g of grouping.groups) {
        for (const r of groupRows(g)) {
          for (const ref of imageRefs(r)) {
            const key = isUrlRef(ref) ? undefined : fileKeyFor(ref);
            if (key) needed.add(key);
          }
        }
      }
      const urlByName = new Map<string, string>();
      const failed = new Map<string, string>();
      let n = 0;
      for (const key of needed) {
        n += 1;
        setProgress(`Uploading images… ${n}/${needed.size}`);
        try {
          const { url } = await withThrottleRetry(
            () => adminUpload(imageFiles.get(key)!, 'products'),
            (err) => err instanceof AdminUploadError && err.status === 429,
            sleep,
            (s) => setProgress(`Server busy — waiting ${s} s…`),
          );
          urlByName.set(key, url);
        } catch (err) {
          failed.set(key, err instanceof Error ? err.message : 'upload failed');
        }
      }

      // 2) Swap file names for uploaded URLs. A row with a missing/failed image
      //    is reported and not sent; a failed Parent row skips its whole group.
      const resolve = (ref: string): ImageResolution => {
        const key = fileKeyFor(ref) ?? ref.trim().toLowerCase();
        const url = urlByName.get(key);
        if (url) return url;
        if (failed.has(key)) return { error: `image upload failed for "${ref}": ${failed.get(key)}` };
        return undefined;
      };
      const issue = (r: SheetRowInput, message: string): void => {
        clientIssues.push({ row: r.row, sku: (r.sku ?? '').trim(), level: 'error', message });
      };
      const ready: SheetGroup[] = [];
      for (const g of grouping.groups) {
        let parent: SheetRowInput | undefined;
        if (g.parent) {
          const res = applyResolvedImages(g.parent, resolve);
          if ('error' in res) {
            issue(g.parent, res.error);
            for (const c of g.children) {
              issue(c, `Not imported: its Parent row ${g.parent.row} could not be imported.`);
            }
            continue;
          }
          parent = res.row;
        }
        const children: SheetRowInput[] = [];
        for (const c of g.children) {
          const res = applyResolvedImages(c, resolve);
          if ('error' in res) issue(c, res.error);
          else children.push(res.row);
        }
        if (parent || children.length > 0) ready.push({ key: g.key, parent, children });
      }

      // 3) Pack whole groups into size-bounded chunks and send them one by one.
      const { chunks, issues: sizeIssues } = chunkGroups(ready);
      clientIssues.push(...sizeIssues);
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i]!;
        setProgress(chunks.length > 1 ? `Importing… ${i + 1}/${chunks.length}` : 'Importing…');
        try {
          const res = await withThrottleRetry(
            () =>
              adminFetch<SheetImportResult>('/admin/products/bulk-v2', {
                method: 'POST',
                body: { rows: chunk, weightUnit: parsed.weightUnitHint ?? undefined },
              }),
            (err) => err instanceof ApiClientError && err.payload.statusCode === 429,
            sleep,
            (s) => setProgress(`Server busy — waiting ${s} s…`),
          );
          totals.productsCreated += res.productsCreated;
          totals.productsUpdated += res.productsUpdated;
          totals.variantsSaved += res.variantsCreated + res.variantsUpdated;
          serverIssues = serverIssues.concat(res.issues);
        } catch (err) {
          if (err instanceof ApiClientError && err.payload.statusCode === 401) {
            clientIssues.push({ row: 0, sku: '', level: 'error', message: SESSION_EXPIRED });
            break;
          }
          const status = err instanceof ApiClientError ? err.payload.statusCode : undefined;
          const message = chunkFailureMessage(err instanceof Error ? err.message : 'unknown error', status);
          for (const r of chunk) {
            clientIssues.push({ row: r.row, sku: (r.sku ?? '').trim(), level: 'error', message });
          }
        }
      }
    } catch (err) {
      clientIssues.push({
        row: 0,
        sku: '',
        level: 'error',
        message: `Import request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    } finally {
      setResult({ ...totals, issues: mergeIssues(clientIssues, serverIssues) });
      setProgress(null);
      setBusy(false);
    }
  }

  const errors = result?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = result?.issues.filter((i) => i.level === 'warning') ?? [];

  return (
    <div data-testid="admin-bulk">
      <div className="pm-head">
        <div>
          <h1>Bulk Product Upload</h1>
          <p className="admin-subtitle" style={{ margin: 0 }}>Create and update many products at once from one Excel file.</p>
        </div>
        <Link href="/admin/catalogue" className="admin-inline-btn" style={{ padding: '9px 16px' }}>← Back to Catalogue</Link>
      </div>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>1. Download the Excel template</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ExcelDownloadButton />
          </div>
        </div>
        <p className="admin-muted" style={{ margin: 0 }}>
          One file for everything. It contains all your products (a Parent row per product, a Child
          row per variant). Edit it in Excel and upload it below, or add new Parent/Child rows for new
          products. Every rule is on the Instructions sheet. <strong>⚠ Quantity/Stock in the file
          replaces live stock.</strong> Clear those cells unless you have just counted stock.
        </p>
      </section>

      <section className="admin-card">
        <div className="admin-card__head"><h2>2. Upload the filled Excel</h2></div>
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => void handleFile(e)}
          disabled={busy}
          data-testid="bulk-file"
        />
        <span className="admin-muted"> .xlsx, or CSV UTF-8 (Comma delimited) with the same headers</span>
        {fileName && parsed && (
          <p className="admin-muted" style={{ marginBottom: 0 }}>
            {fileName} — {counts.products} products · {counts.variants} variants in {rows.length} rows
          </p>
        )}
        {parseErr && <p className="prod-form__msg" role="status">{parseErr}</p>}

        <div style={{ marginTop: 14 }}>
          <label className="auth-label">Product images (optional)</label>
          <label
            className={`wiz__drop${dragOver ? ' wiz__drop--over' : ''}`}
            aria-disabled={busy}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!busy) addImageFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              className="wiz__drop-input"
              disabled={busy}
              data-testid="bulk-images"
              onChange={(e) => {
                addImageFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <span className="wiz__drop-ic">⬆</span>
            <span className="wiz__drop-main">
              {dragOver ? 'Drop images here' : 'Click or drag product images here'}
            </span>
            <span className="wiz__drop-sub">
              Select every image named in the image 1–5 cells · matched by file name (or by SKU)
            </span>
          </label>
          {imageFiles.size > 0 && (
            <p className="admin-muted" style={{ marginTop: 6 }}>
              {imageFiles.size} image{imageFiles.size === 1 ? '' : 's'} selected:{' '}
              {[...imageFiles.values()].map((f) => f.name).join(', ')}{' '}
              <button
                type="button"
                className="admin-inline-btn"
                onClick={() => setImageFiles(new Map())}
                disabled={busy}
              >
                Clear
              </button>
            </p>
          )}
          {missingFiles.length > 0 && (
            <p className="prod-form__msg" data-testid="bulk-missing-images">
              ⚠ Not selected yet: {missingFiles.join(', ')}. Add these image files above, or those
              rows will be skipped.
            </p>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <table className="admin-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Row</th><th>Type</th><th>Parent SKU</th><th>SKU</th><th>Title or Size / Colour</th>
                  <th>MRP</th><th>Selling</th><th>Stock</th><th>Images</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((r) => {
                  const isChild = r.indicator
                    ? /^(c|child|variant)$/i.test(r.indicator.trim())
                    : !!r.parentSku && r.parentSku.trim() !== (r.sku ?? '').trim();
                  const refs = imageRefs(r);
                  return (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{isChild ? 'Child' : 'Parent'}</td>
                      <td>{r.parentSku ?? ''}</td>
                      <td>{r.sku ?? ''}</td>
                      <td>{isChild ? [r.size, r.colour].filter(Boolean).join(' / ') : (r.title ?? '')}</td>
                      <td>{r.mrp ? `₹${r.mrp}` : '—'}</td>
                      <td>{r.sellingPrice ? `₹${r.sellingPrice}` : '—'}</td>
                      <td>{r.stock ?? '—'}</td>
                      <td>
                        {refs.length}
                        {refs.some((ref) => !isUrlRef(ref) && !fileKeyFor(ref)) && ' ⚠'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > PREVIEW_ROWS && (
              <p className="admin-muted">…and {rows.length - PREVIEW_ROWS} more rows.</p>
            )}
            <button
              className="btn"
              onClick={() => void importRows()}
              disabled={busy}
              data-testid="bulk-import"
              style={{ marginTop: 12 }}
            >
              {busy ? (progress ?? 'Importing…') : `Import ${counts.products} products`}
            </button>
          </>
        )}
      </section>

      {result && (
        <section className="admin-card" data-testid="bulk-result">
          <div className="admin-card__head"><h2>3. Result</h2></div>
          <p>
            <span className="admin-status admin-status--ok">
              {result.productsCreated} products created · {result.productsUpdated} updated · {result.variantsSaved} variants saved
            </span>{' '}
            {errors.length > 0 && (
              <span className="admin-status admin-status--bad">{errors.length} errors</span>
            )}{' '}
            {warnings.length > 0 && (
              <span className="admin-status admin-status--warn">{warnings.length} warnings</span>
            )}
          </p>
          {errors.length > 0 && (
            <table className="admin-table">
              <caption style={{ textAlign: 'left' }}>Errors</caption>
              <thead><tr><th>Row</th><th>SKU</th><th>Message</th></tr></thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i}><td>{e.row || '—'}</td><td>{e.sku}</td><td>{e.message}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {warnings.length > 0 && (
            <table className="admin-table" data-testid="bulk-warnings" style={{ marginTop: 12 }}>
              <caption style={{ textAlign: 'left' }}>Warnings</caption>
              <thead><tr><th>Row</th><th>SKU</th><th>Message</th></tr></thead>
              <tbody>
                {warnings.map((w, i) => (
                  <tr key={i}><td>{w.row}</td><td>{w.sku}</td><td>{w.message}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
