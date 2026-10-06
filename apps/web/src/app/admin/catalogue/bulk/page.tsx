'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CategoryNodeDto } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';
import { ApiClientError } from '@/lib/api-client';

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

const COLUMNS = [
  'sku',
  'title',
  'categorySlug',
  'mrp',
  'sellingPrice',
  'description',
  'brand',
  'hsnCode',
  'taxRatePct',
  'stock',
  'status',
  'imageUrl',
];

// Used only if the category tree can't be loaded. Must be a real leaf slug.
const FALLBACK_SLUG = 'green-tea';

function buildTemplate(leafSlug: string): string {
  return (
    `${COLUMNS.join(',')}\n` +
    `RICE-5KG,Basmati Rice 5kg,${leafSlug},899,799,Premium aged basmati rice,Belzo,1006,5,100,published,https://example.com/rice-front.jpg|https://example.com/rice-back.jpg\n`
  );
}

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

/** Minimal CSV parser that supports quoted fields with commas. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inq = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') {
        if (inq && line[i + 1] === '"') { cur += '"'; i += 1; } else inq = !inq;
      } else if (c === ',' && !inq) {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ''));
    return obj;
  });
}

/** Bulk product upload via CSV (FR-8.3). Prices in the CSV are in rupees. */
export default function BulkUploadPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: number; errors: { row: number; message: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaves, setLeaves] = useState<{ name: string; slug: string }[]>([]);

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
      const res = await adminFetch<{ ok: number; errors: { row: number; message: string }[] }>(
        '/admin/products/bulk',
        { method: 'POST', body: { rows } },
      );
      setResult(res);
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
          <a className="btn" href={templateHref} download="belzo-products-template.csv">⬇ Download template</a>
        </div>
        <p className="admin-muted" style={{ margin: 0 }}>
          Columns: <code>{COLUMNS.join(', ')}</code>. Prices are in <strong>rupees</strong>.
          Required: <code>sku</code>, <code>title</code>, <code>categorySlug</code>, <code>mrp</code>,{' '}
          <code>sellingPrice</code>. Everything else is optional.
          <code> categorySlug</code> must match an existing leaf category (see the list below).
          <code> status</code> accepts <code>draft</code> or <code>published</code>; new SKUs
          default to <strong>published</strong> so they appear on the storefront.
          Images are referenced by <strong>URL</strong> (a CSV cannot carry image files) — put one
          or more URLs in <code>imageUrl</code> separated by <code>|</code>.
          Existing SKUs get their price updated, keep their current images, and have any new image
          URLs appended.
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

        {rows.length > 0 && (
          <>
            <table className="admin-table" style={{ marginTop: 12 }}>
              <thead><tr><th>SKU</th><th>Title</th><th>Category</th><th>MRP</th><th>Price</th><th>GST%</th><th>Stock</th><th>Images</th></tr></thead>
              <tbody>
                {rows.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    <td>{r.sku}</td><td>{r.title}</td><td>{r.categorySlug}</td>
                    <td>₹{(r.mrp / 100).toFixed(2)}</td><td>₹{(r.sellingPrice / 100).toFixed(2)}</td><td>{r.taxRatePct ?? '—'}</td>
                    <td>{r.stock ?? '—'}</td><td>{r.imageUrls?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 12 && <p className="admin-muted">…and {rows.length - 12} more rows.</p>}
            <button className="btn" onClick={importRows} disabled={busy} data-testid="bulk-import" style={{ marginTop: 12 }}>
              {busy ? 'Importing…' : `Import ${rows.length} products`}
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
            New SKUs are published by default and appear on the storefront immediately.
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
