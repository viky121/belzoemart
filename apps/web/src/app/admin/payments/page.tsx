'use client';

import { useAdminData } from '../use-admin-page';
import { formatInr } from '@/lib/catalogue-api';
import { GatewayStatusCard } from './gateway-status';

interface Payment {
  id: string;
  orderId: string;
  provider: string;
  method: string | null;
  amount: number;
  status: string;
  createdAt: string;
}
interface PaymentsReport {
  items: Payment[];
  captured: number;
  refunded: number;
  count: number;
}

const STATUS_CLASS: Record<string, string> = {
  captured: 'admin-status--ok',
  refunded: 'admin-status--info',
  failed: 'admin-status--bad',
  created: 'admin-status--warn',
};

/** Admin Payments & Settlements: ledger of payments with settlement totals. */
export default function AdminPaymentsPage() {
  const { data, loading } = useAdminData<PaymentsReport>('/admin/payments');
  if (loading) return <p>Loading…</p>;
  if (!data) return null;

  const net = data.captured - data.refunded;

  return (
    <div data-testid="admin-payments">
      <h1>Payments &amp; Settlements</h1>
      <p className="admin-subtitle">Payment ledger across orders and net settlement.</p>

      <GatewayStatusCard />

      <div className="dash-kpis">
        <div className="dash-kpi dash-kpi--b" data-testid="pay-captured">
          <span className="dash-kpi__icon">₹</span>
          <div><div className="dash-kpi__value">{formatInr(data.captured)}</div><div className="dash-kpi__label">Captured</div></div>
        </div>
        <div className="dash-kpi dash-kpi--c" data-testid="pay-refunded">
          <span className="dash-kpi__icon">↩</span>
          <div><div className="dash-kpi__value">{formatInr(data.refunded)}</div><div className="dash-kpi__label">Refunded</div></div>
        </div>
        <div className="dash-kpi dash-kpi--a" data-testid="pay-net">
          <span className="dash-kpi__icon">＝</span>
          <div><div className="dash-kpi__value">{formatInr(net)}</div><div className="dash-kpi__label">Net settlement</div></div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="admin-empty" data-testid="payments-empty">No payments yet.</div>
      ) : (
        <section className="admin-card">
          <table className="admin-table" data-testid="payments-table">
            <thead>
              <tr><th>Payment</th><th>Order</th><th>Provider</th><th>Method</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td><strong>#{p.id.slice(0, 8).toUpperCase()}</strong></td>
                  <td>#{p.orderId.slice(0, 8).toUpperCase()}</td>
                  <td>{p.provider}</td>
                  <td>{p.method ?? '—'}</td>
                  <td>{formatInr(p.amount)}</td>
                  <td><span className={`admin-status ${STATUS_CLASS[p.status] ?? ''}`}>{p.status}</span></td>
                  <td>{new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
