'use client';

import { useEffect, useState } from 'react';
import { apiBaseUrl } from '@/lib/api-base';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';

interface SalesRow {
  status: string;
  orders: number;
  revenue: number;
}
interface GstReport {
  totalTax: number;
  byRate: { taxableRate: number; tax: number; orders: number }[];
}

/** Admin reports: sales + GST tables with CSV download (FR-12). */
export default function AdminReportsPage() {
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [gst, setGst] = useState<GstReport | null>(null);

  useEffect(() => {
    void adminFetch<SalesRow[]>('/admin/reports/sales').then(setSales).catch(() => setSales([]));
    void adminFetch<GstReport>('/admin/reports/gst').then(setGst).catch(() => setGst(null));
  }, []);

  return (
    <div data-testid="admin-reports">
      <h1>Reports</h1>
      <p className="admin-subtitle">Sales, tax and inventory reports with CSV export.</p>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>Sales by status</h2>
          <a className="btn" href={`${apiBaseUrl()}/api/v1/admin/reports/sales?format=csv`} data-testid="sales-csv">
            ⬇ Download CSV
          </a>
        </div>
        {sales.length === 0 ? (
          <div className="admin-empty">No sales data yet.</div>
        ) : (
          <table className="admin-table" data-testid="sales-report">
            <thead><tr><th>Status</th><th>Orders</th><th>Revenue</th></tr></thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.status}>
                  <td><span className="admin-status">{s.status}</span></td>
                  <td>{s.orders}</td>
                  <td>{formatInr(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>GST summary</h2>
          {gst && <span className="admin-status admin-status--info" data-testid="gst-total">Total tax: {formatInr(gst.totalTax)}</span>}
        </div>
        {gst && gst.byRate.length > 0 ? (
          <table className="admin-table" data-testid="gst-report">
            <thead><tr><th>GST rate</th><th>Orders</th><th>Tax collected</th></tr></thead>
            <tbody>
              {gst.byRate.map((r) => (
                <tr key={r.taxableRate}><td>{r.taxableRate}%</td><td>{r.orders}</td><td>{formatInr(r.tax)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="admin-empty">No tax collected yet.</div>
        )}
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>Inventory</h2>
          <a className="btn" href={`${apiBaseUrl()}/api/v1/admin/reports/inventory?format=csv`} data-testid="inventory-csv">
            ⬇ Download low-stock CSV
          </a>
        </div>
        <p className="admin-subtitle" style={{ margin: 0 }}>Export the current low-stock report as CSV.</p>
      </section>
    </div>
  );
}
