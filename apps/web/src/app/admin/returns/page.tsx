'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';

interface ReturnRow {
  id: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  order: { id: string; grandTotal: number; status: string } | null;
}

const STATUS_CLASS: Record<string, string> = {
  received: 'admin-status--ok',
  refunded: 'admin-status--ok',
  rejected: 'admin-status--bad',
  approved: 'admin-status--info',
  picked: 'admin-status--info',
};

/** Next admin action(s) available for a return in a given status. */
function actionsFor(status: string): { label: string; to: string }[] {
  const s = status.toLowerCase();
  if (['requested', 'pending', 'open'].includes(s))
    return [{ label: 'Approve', to: 'approved' }, { label: 'Reject', to: 'rejected' }];
  if (s === 'approved') return [{ label: 'Mark picked', to: 'picked' }, { label: 'Reject', to: 'rejected' }];
  if (s === 'picked') return [{ label: 'Mark received (refund)', to: 'received' }];
  return [];
}

/** Admin Returns & Refunds: moderate return requests, trigger refunds on receipt. */
export default function AdminReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await adminFetch<ReturnRow[]>('/admin/orders/returns').catch(() => []));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function update(id: string, to: string) {
    try {
      await adminFetch(`/admin/orders/returns/${id}`, { method: 'PATCH', body: { status: to } });
      setMsg(`Return ${id.slice(0, 8)} → ${to}`);
      void load();
    } catch {
      setMsg('Could not update the return.');
    }
  }

  const pending = rows.filter((r) => actionsFor(r.status).length > 0).length;

  return (
    <div data-testid="admin-returns">
      <h1>Returns &amp; Refunds</h1>
      <p className="admin-subtitle">
        Moderate return requests. Marking a return “received” restocks items and refunds the payment.
      </p>
      {msg && <p role="status" data-testid="returns-msg">{msg}</p>}

      <div className="admin-toolbar">
        <span className="admin-status admin-status--warn">{pending} awaiting action</span>
        <span className="admin-muted">{rows.length} total</span>
      </div>

      {rows.length === 0 ? (
        <div className="admin-empty" data-testid="returns-empty">🎉 No return requests.</div>
      ) : (
        <section className="admin-card">
          <table className="admin-table" data-testid="returns-table">
            <thead>
              <tr><th>Return</th><th>Order</th><th>Reason</th><th>Resolution</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>#{r.id.slice(0, 8).toUpperCase()}</strong></td>
                  <td>{r.order ? `#${r.order.id.slice(0, 8).toUpperCase()}` : '—'}</td>
                  <td>{r.reason}</td>
                  <td>{r.resolution ?? '—'}</td>
                  <td>{r.order ? formatInr(r.order.grandTotal) : '—'}</td>
                  <td><span className={`admin-status ${STATUS_CLASS[r.status] ?? ''}`}>{r.status}</span></td>
                  <td>
                    {actionsFor(r.status).length === 0 ? (
                      <span className="admin-muted">—</span>
                    ) : (
                      actionsFor(r.status).map((a) => (
                        <button
                          key={a.to}
                          className={a.to === 'rejected' ? 'admin-btn--danger' : ''}
                          onClick={() => update(r.id, a.to)}
                          data-testid={`return-${a.to}-${r.id}`}
                        >
                          {a.label}
                        </button>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
