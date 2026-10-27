'use client';

import { useEffect, useState } from 'react';
import { istDayEnd, istDayStart } from '@belzo/shared';
import { adminDownload, adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';

interface GstReport {
  totalTax: number;
  byRate: { taxableRate: number; tax: number; orders: number }[];
}

/** GST summary for the chosen days, and the low-stock export (the reports that were here before). */
export function GstStockTab({ from, to }: { from: string; to: string }) {
  const [gst, setGst] = useState<GstReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ from: istDayStart(from).toISOString(), to: istDayEnd(to).toISOString() });
    void adminFetch<GstReport>(`/admin/reports/gst?${qs.toString()}`)
      .then(setGst)
      .catch(() => setGst(null));
  }, [from, to]);

  async function download(path: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      await adminDownload(path, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download the file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="report-gst">
      <section className="admin-card">
        <div className="admin-card__head">
          <h2>GST summary</h2>
          {gst && (
            <span className="admin-status admin-status--info" data-testid="gst-total">
              Total tax: {formatInr(gst.totalTax)}
            </span>
          )}
        </div>
        {gst && gst.byRate.length > 0 ? (
          <table className="admin-table" data-testid="gst-report">
            <thead>
              <tr>
                <th>GST rate</th>
                <th>Orders</th>
                <th>Tax collected</th>
              </tr>
            </thead>
            <tbody>
              {gst.byRate.map((r) => (
                <tr key={r.taxableRate}>
                  <td>{r.taxableRate}%</td>
                  <td>{r.orders}</td>
                  <td>{formatInr(r.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="admin-empty">No tax collected in this period.</div>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>Downloads</h2>
        </div>
        <p className="admin-subtitle" style={{ marginTop: 0 }}>
          The low-stock list shows what is running out right now, whatever days are chosen above.
        </p>
        <div className="rep-head__actions">
          <button type="button" className="rep-btn" disabled={busy} data-testid="inventory-csv" onClick={() => void download('/admin/reports/inventory?format=csv', 'low-stock.csv')}>
            ⬇ Low-stock CSV
          </button>
          <button
            type="button"
            className="rep-btn"
            disabled={busy}
            data-testid="sales-csv"
            onClick={() =>
              void download(
                `/admin/reports/sales?${new URLSearchParams({ from: istDayStart(from).toISOString(), to: istDayEnd(to).toISOString(), format: 'csv' }).toString()}`,
                `sales-by-status_${from}_${to}.csv`,
              )
            }
          >
            ⬇ Sales by status CSV
          </button>
        </div>
        {error && (
          <p className="prod-form__msg prod-form__msg--err" role="alert" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
