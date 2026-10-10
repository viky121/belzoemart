'use client';

import { useState } from 'react';
import type { SheetExport } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';
import { ApiClientError } from '@/lib/api-client';
import { productsXlsxFilename } from '@/lib/product-sheet';
import { buildProductWorkbook } from '@/lib/product-xlsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Downloads the one product Excel template: every draft/published product
 * (Parent + Child rows), or two EXAMPLE rows for an empty catalogue. The same
 * file is uploaded back on the bulk page. exceljs loads only on click.
 */
export function ExcelDownloadButton({
  className = 'btn',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setMsg(null);
    try {
      const data = await adminFetch<SheetExport>('/admin/products/sheet');
      const buf = await buildProductWorkbook(data);
      const url = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
      const a = document.createElement('a');
      a.href = url;
      a.download = productsXlsxFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof ApiClientError && e.payload.statusCode === 401) {
        setMsg('Your admin session has expired. Please log in again and retry.');
      } else {
        setMsg(`Download failed: ${e instanceof Error ? e.message : 'unknown error'}`);
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
        onClick={() => void download()}
        disabled={busy}
        data-testid="download-excel"
        style={style}
      >
        {busy ? 'Preparing…' : '⬇ Download Excel'}
      </button>
      {msg && (
        <span role="status" className="prod-form__msg">
          {msg}
        </span>
      )}
    </>
  );
}
