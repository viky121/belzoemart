'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { ApiClientError } from '@/lib/api-client';
import { buildProductsCsv, productsCsvFilename, type ProductExportRow } from '@/lib/product-csv';

/**
 * Downloads every draft/published product as a bulk-upload-shaped CSV so it
 * can be edited in Excel and re-uploaded on the bulk page.
 */
export function ExportProductsButton({
  className = 'btn',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function exportProducts() {
    setBusy(true);
    setMsg(null);
    try {
      const { rows } = await adminFetch<{ rows: ProductExportRow[] }>('/admin/products/export');
      if (rows.length === 0) {
        setMsg('No products to export yet.');
        return;
      }
      const blob = new Blob([buildProductsCsv(rows)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = productsCsvFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof ApiClientError && e.payload.statusCode === 401) {
        setMsg('Your admin session has expired. Please log in again and retry.');
      } else {
        setMsg(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => void exportProducts()}
        disabled={busy}
        data-testid="export-products"
        style={style}
      >
        {busy ? 'Exporting…' : '⬇ Export products (CSV)'}
      </button>
      {msg && (
        <span role="status" className="prod-form__msg">
          {msg}
        </span>
      )}
    </>
  );
}
