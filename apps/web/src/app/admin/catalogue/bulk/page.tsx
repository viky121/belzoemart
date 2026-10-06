'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CategoryNodeDto } from '@belzo/shared';
import { adminFetch, adminUpload } from '@/lib/admin-api';
import { ApiClientError } from '@/lib/api-client';
import { parseCsv } from '@/lib/csv';
import { PRODUCT_CSV_COLUMNS } from '@/lib/product-csv';
import { ExportProductsButton } from '../export-button';

interface Row {
  sku: string;
  title: string;
  categorySlug: string;
  mrp: number;
  sellingPrice: number;
  description?: string;
  brand?: string;
  hsnCode?: string;
  taxRatePct?: number;
  stock?: number;
  status?: 'draft' | 'published';
  imageUrls?: string[];
}

// Used only if the category tree can't be loaded. Must be a real leaf slug.
const FALLBACK_SLUG = 'green-tea';

function buildTemplate(leafSlug: string): string {
  return (
    `${PRODUCT_CSV_COLUMNS.join(',')}\n` +
    `RICE-5KG,Basmati Rice 5kg,${leafSlug},899,799,Premium aged basmati rice,Belzo,1006,5,100,published,rice-front.jpg|rice-back.jpg\n`
  );
}

/** An imageUrl entry that is already a usable link (vs. a local file name). */
const isUrlRef = (s: string): boolean => /^https?:\/\//i.test(s) || s.startsWith('/');

/** Flatten the nested category tree to leaf nodes (those without children). */
function leafCategories(nodes: CategoryNodeDto[]): { name: string; slug: string }[] {
  const out: { name: string; slug: string }[] = [];
  const walk = (list: CategoryNodeDto[]): void => {
    for (const n of list) {
      if (n.children && n.children.length > 0) walk(n.children);
      else out.push({ name: n.name, slug: n.slug });
    }
  };
  walk(nodes);
  return out;
}

/** Bulk product upload via CSV (FR-8.3). Prices in the CSV are in rupees. */
export default function BulkUploadPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: number; errors: { row: number; message: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaves, setLeaves] = useState<{ name: string; slug: string }[]>([]);
  // Image files picked on this page, keyed by lower-cased file name. CSV rows
  // reference them by name in `imageUrl` (or by SKU-based file names).
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

  /** Files named after the SKU: RICE-5KG.jpg, RICE-5KG-2.jpg, RICE-5KG_back.png… */
  function skuFiles(sku: string): string[] {
    const s = sku.trim().toLowerCase();
    if (!s) return [];
    return [...imageFiles.keys()]
      .filter((name) => {
        const base = name.replace(/\.[^.]+$/, '');
        return base === s || base.startsWith(`${s}-`) || base.startsWith(`${s}_`);
      })
      .sort();
  }

  /**
   * Find the selected file for an imageUrl entry. Exact (case-insensitive) name
   * first; otherwise match on the name WITHOUT its extension when exactly one
   * selected file has it — so "photo.png" in the CSV still finds "photo.jpg".
   */
  function fileKeyFor(ref: string): string | undefined {
    const key = ref.trim().toLowerCase();
    if (imageFiles.has(key)) return key;
    const base = key.replace(/\.[^.]+$/, '');
    const hits = [...imageFiles.keys()].filter((k) => k.replace(/\.[^.]+$/, '') === base);
    return hits.length === 1 ? hits[0] : undefined;
  }

  /** Image references for a row: its imageUrl entries, else SKU-named files. */
  function imageRefs(r: Row): string[] {
    return r.imageUrls && r.imageUrls.length > 0 ? r.imageUrls : skuFiles(r.sku);
  }

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

  // Load the category tree so the template uses a REAL leaf slug and admins can
  // see/copy valid slugs (the key usability fix — the old 'grocery' slug did
  // not exist, so every row failed with "unknown category").
  useEffect(() => {
    void adminFetch<CategoryNodeDto[]>('/admin/categories')
      .then((tree) => setLeaves(leafCategories(tree)))
      .catch(() => setLeaves([]));
  }, []);

  const template = useMemo(() => buildTemplate(leaves[0]?.slug ?? FALLBACK_SLUG), [leaves]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result));
        const mapped: Row[] = parsed.map((r) => {
          const status = r.status?.trim().toLowerCase();
          const imageUrls = (r.imageUrl ?? '')
            .split('|')
            .map((u) => u.trim())
            .filter(Boolean);
          return {
            sku: r.sku,
            title: r.title,
            categorySlug: r.categorySlug,
            mrp: Math.round(parseFloat(r.mrp || '0') * 100),
            sellingPrice: Math.round(parseFloat(r.sellingPrice || '0') * 100),
            description: r.description || undefined,
            brand: r.brand || undefined,
            hsnCode: r.hsnCode || undefined,
            taxRatePct: r.taxRatePct ? Number(r.taxRatePct) : undefined,
            stock: r.stock ? Math.trunc(Number(r.stock)) : undefined,
            status: status === 'draft' || status === 'published' ? status : undefined,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          };
        });
        const valid = mapped.filter((r) => r.sku && r.title && r.categorySlug);
        if (valid.length === 0) setParseErr('No valid rows found. Check the column headers.');
        setRows(valid);
      } catch {
        setParseErr('Could not parse this CSV file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function importRows() {
    setBusy(true);
    setResult(null);
    try {
      // 1) Upload every image file referenced by the rows (each file once).
      const needed = new Set<string>();
      for (const r of rows) {
        for (const ref of imageRefs(r)) {
          const key = isUrlRef(ref) ? undefined : fileKeyFor(ref);
          if (key) needed.add(key);
        }
      }
      const urlByName = new Map<string, string>();
      const failed = new Map<string, string>();
      let n = 0;
      for (const key of needed) {
        n += 1;
        setProgress(`Uploading images… ${n}/${needed.size}`);
        try {
          const { url } = await adminUpload(imageFiles.get(key)!, 'products');
          urlByName.set(key, url);
        } catch (err) {
          failed.set(key, err instanceof Error ? err.message : 'upload failed');
        }
      }
      setProgress(needed.size > 0 ? 'Importing…' : null);

      // 2) Swap file names for uploaded URLs; rows with a missing/failed image
      //    are reported here and not sent (so no product gets a broken image).
      const clientErrors: { row: number; message: string }[] = [];
      const payload: Row[] = [];
      const originalIndex: number[] = [];
      rows.forEach((r, i) => {
        const urls: string[] = [];
        let problem: string | null = null;
        for (const ref of imageRefs(r)) {
          if (isUrlRef(ref)) {
            urls.push(ref);
            continue;
          }
          const key = fileKeyFor(ref) ?? ref.trim().toLowerCase();
          const u = urlByName.get(key);
          if (u) urls.push(u);
          else if (failed.has(key)) problem = `image upload failed for "${ref}": ${failed.get(key)}`;
          else problem = `image file "${ref}" was not selected in step 2`;
          if (problem) break;
        }
        if (problem) {
          clientErrors.push({ row: i + 1, message: problem });
          return;
        }
        payload.push({ ...r, imageUrls: urls.length > 0 ? urls : undefined });
        originalIndex.push(i);
      });

      // 3) Import the remaining rows; map server row numbers back to the CSV.
      let ok = 0;
      let serverErrors: { row: number; message: string }[] = [];
      if (payload.length > 0) {
        const res = await adminFetch<{ ok: number; errors: { row: number; message: string }[] }>(
          '/admin/products/bulk',
          { method: 'POST', body: { rows: payload } },
        );
        ok = res.ok;
        serverErrors = res.errors.map((e) => ({
          ...e,
          row: e.row >= 1 ? (originalIndex[e.row - 1] ?? e.row - 1) + 1 : e.row,
        }));
      }
      setResult({ ok, errors: [...clientErrors, ...serverErrors].sort((a, b) => a.row - b.row) });
    } catch (e) {
      // Surface the real reason (e.g. expired session, validation error).
      let message = 'Import request failed.';
      if (e instanceof ApiClientError) {
        message =
          e.payload.statusCode === 401
            ? 'Your admin session has expired. Please log in again and retry.'
            : `Import request failed: ${e.payload.message}`;
      } else if (e instanceof Error && e.message) {
        message = `Import request failed: ${e.message}`;
      }
      setResult({ ok: 0, errors: [{ row: 0, message }] });
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(template)}`;

  return (
    <div data-testid="admin-bulk">
      <div className="pm-head">
        <div>
          <h1>Bulk Product Upload</h1>
          <p className="admin-subtitle" style={{ margin: 0 }}>Import many products at once from a CSV file.</p>
        </div>
        <Link href="/admin/catalogue" className="admin-inline-btn" style={{ padding: '9px 16px' }}>← Back to Catalogue</Link>
      </div>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>1. Prepare your CSV</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <ExportProductsButton />
            <a className="btn" href={templateHref} download="belzo-products-template.csv">⬇ Download template</a>
          </div>
        </div>
        <p className="admin-muted" style={{ marginTop: 0 }}>
          <strong>To edit existing products:</strong> Export products → edit in Excel → save as{' '}
          <strong>CSV UTF-8</strong> → upload here. Existing SKUs get title, category, MRP, selling
          price, description, brand, HSN, GST, stock and status updated; <strong>blank optional
          cells leave the current value unchanged</strong>. Re-uploading the SKU of a removed
          variant kept for order history restores it with the row&apos;s values. A non-empty <code>imageUrl</code>{' '}
          <strong>replaces</strong> the product&apos;s images with exactly those images in that order
          (first = main); a blank <code>imageUrl</code> keeps the current images. Variants of the
          same product share product-level fields (title, category, description, brand, HSN, GST,
          status, images) — if their rows disagree, the last row wins. Products without variants
          are not exported. In Excel, format the <code>sku</code> and <code>hsnCode</code> columns
          as <strong>Text</strong> so leading zeros are kept.
        </p>
        <p className="admin-muted" style={{ margin: 0 }}>
          Columns: <code>{PRODUCT_CSV_COLUMNS.join(', ')}</code>. Prices are in <strong>rupees</strong>.
          Required: <code>sku</code>, <code>title</code>, <code>categorySlug</code>, <code>mrp</code>,{' '}
          <code>sellingPrice</code>. Everything else is optional.
          <code> categorySlug</code> must match an existing leaf category (see the list below).
          <code> status</code> accepts <code>draft</code> or <code>published</code>; new SKUs
          default to <strong>published</strong> so they appear on the storefront.
          <strong>Images:</strong> select the image files in step 2 and write their file names in{' '}
          <code>imageUrl</code> separated by <code>|</code> (e.g. <code>rice-front.jpg|rice-back.jpg</code>)
          — or leave <code>imageUrl</code> empty and name the files after the SKU
          (<code>RICE-5KG.jpg</code>, <code>RICE-5KG-2.jpg</code>). Full links (<code>https://…</code>) also work.
          The first image becomes the main image.
        </p>
        {leaves.length > 0 && (
          <>
            <p className="admin-muted" style={{ marginBottom: 4, marginTop: 12 }}>
              <strong>Valid category slugs</strong> (copy one into the <code>categorySlug</code> column):
            </p>
            <datalist id="bulk-category-slugs">
              {leaves.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </datalist>
            <div
              className="admin-muted"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}
            >
              {leaves.map((c) => (
                <code key={c.slug} title={c.name} style={{ padding: '2px 6px' }}>{c.slug}</code>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-card__head"><h2>2. Upload &amp; preview</h2></div>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} data-testid="bulk-file" />
        {fileName && <span className="admin-muted"> {fileName} — {rows.length} rows</span>}
        {parseErr && <p className="prod-form__msg">{parseErr}</p>}

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
              Select all images used in the CSV at once · matched by file name (or by SKU)
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
              <thead><tr><th>SKU</th><th>Title</th><th>Category</th><th>MRP</th><th>Price</th><th>GST%</th><th>Stock</th><th>Images</th></tr></thead>
              <tbody>
                {rows.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td>{r.sku}</td><td>{r.title}</td><td>{r.categorySlug}</td>
                    <td>₹{(r.mrp / 100).toFixed(2)}</td><td>₹{(r.sellingPrice / 100).toFixed(2)}</td><td>{r.taxRatePct ?? '—'}</td>
                    <td>{r.stock ?? '—'}</td>
                    <td>
                      {imageRefs(r).length}
                      {imageRefs(r).some((ref) => !isUrlRef(ref) && !fileKeyFor(ref)) && ' ⚠'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 12 && <p className="admin-muted">…and {rows.length - 12} more rows.</p>}
            <button className="btn" onClick={importRows} disabled={busy} data-testid="bulk-import" style={{ marginTop: 12 }}>
              {busy ? (progress ?? 'Importing…') : `Import ${rows.length} products`}
            </button>
          </>
        )}
      </section>

      {result && (
        <section className="admin-card" data-testid="bulk-result">
          <div className="admin-card__head"><h2>3. Result</h2></div>
          <p><span className="admin-status admin-status--ok">{result.ok} imported</span>{' '}
            {result.errors.length > 0 && <span className="admin-status admin-status--bad">{result.errors.length} failed</span>}</p>
          <p className="admin-muted" style={{ marginTop: 0 }}>
            New SKUs are published by default and appear on the storefront immediately. Existing
            SKUs were updated in place (blank cells left unchanged).
          </p>
          {result.errors.length > 0 && (
            <table className="admin-table">
              <thead><tr><th>Row</th><th>Error</th></tr></thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
