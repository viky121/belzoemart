'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';

interface AdminOrder {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  invoiceUrl: string | null;
}
interface Paged {
  items: AdminOrder[];
  total: number;
  page: number;
  pageSize: number;
}

const NEXT_STATUS: Record<string, string> = {
  confirmed: 'packed',
  packed: 'shipped',
  shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'packed', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returned', label: 'Returned' },
];

const STATUS_CLASS: Record<string, string> = {
  delivered: 'admin-status--ok',
  cancelled: 'admin-status--bad',
  returned: 'admin-status--bad',
  pending: 'admin-status--warn',
  confirmed: 'admin-status--info',
};

/** A first invoice is only issued for placed (non-pending), non-cancelled orders. */
function canGenerateInvoice(o: AdminOrder): boolean {
  return o.status !== 'pending' && o.status !== 'cancelled';
}

/** Admin orders: status tabs, search, pagination, advance status, shipments, invoices. */
export default function AdminOrdersPage() {
  const [data, setData] = useState<Paged>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    setData(
      await adminFetch<Paged>(`/admin/orders?${params.toString()}`).catch(() => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      })),
    );
  }, [status, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(o: AdminOrder) {
    const next = NEXT_STATUS[o.status];
    if (!next) return;
    await adminFetch(`/admin/orders/${o.id}/status`, { method: 'PATCH', body: { status: next } });
    setMsg(`Order ${o.id.slice(0, 8)} → ${next.replace(/_/g, ' ')}`);
    void load();
  }

  async function createShipment(o: AdminOrder) {
    await adminFetch(`/admin/orders/${o.id}/shipment`, { method: 'POST' });
    setMsg(`Shipment created for ${o.id.slice(0, 8)}`);
    void load();
  }

  /** Re-render the invoice with current store details (same number); generates one if missing. */
  async function regenerateInvoice(o: AdminOrder) {
    setBusyId(o.id);
    try {
      const res = await adminFetch<{ url: string; number: string }>(`/admin/orders/${o.id}/invoice/regenerate`, {
        method: 'POST',
      });
      setMsg(`Invoice ${res.number} updated for #${o.id.slice(0, 8).toUpperCase()}`);
      void load();
    } catch (e) {
      setMsg(`Could not update invoice: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div data-testid="admin-orders">
      <h1>Orders</h1>
      <p className="admin-subtitle">Track orders, advance fulfilment status and create shipments.</p>
      {msg && <p role="status" data-testid="orders-msg">{msg}</p>}

      <div className="admin-tabs" data-testid="orders-tabs">
        {TABS.map((t) => (
          <button
            key={t.key || 'all'}
            className={`admin-tab${status === t.key ? ' is-on' : ''}`}
            onClick={() => {
              setStatus(t.key);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <input
          className="pm-search"
          style={{ maxWidth: 320, margin: 0 }}
          placeholder="Search by order ID…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          data-testid="orders-search"
        />
        <span className="admin-muted">{data.total} orders</span>
      </div>

      <section className="admin-card">
        {data.items.length === 0 ? (
          <div className="admin-empty" data-testid="orders-empty">No orders found.</div>
        ) : (
          <table className="admin-table" data-testid="orders-table">
            <thead>
              <tr><th>Order</th><th>Status</th><th>Total</th><th>Placed</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id}>
                  <td><strong>#{o.id.slice(0, 8).toUpperCase()}</strong></td>
                  <td><span className={`admin-status ${STATUS_CLASS[o.status] ?? ''}`}>{o.status.replace(/_/g, ' ')}</span></td>
                  <td>{formatInr(o.grandTotal)}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>
                    {o.status === 'confirmed' && (
                      <button onClick={() => createShipment(o)} data-testid={`ship-${o.id}`}>Create shipment</button>
                    )}
                    {NEXT_STATUS[o.status] && (
                      <button onClick={() => advance(o)} data-testid={`advance-${o.id}`}>
                        → {NEXT_STATUS[o.status].replace(/_/g, ' ')}
                      </button>
                    )}
                    {o.invoiceUrl && (
                      <a href={o.invoiceUrl} target="_blank" rel="noreferrer" data-testid={`invoice-${o.id}`}>
                        Invoice
                      </a>
                    )}
                    {(o.invoiceUrl || canGenerateInvoice(o)) && (
                      <button
                        onClick={() => regenerateInvoice(o)}
                        disabled={busyId === o.id}
                        data-testid={`regen-invoice-${o.id}`}
                      >
                        {busyId === o.id ? 'Updating…' : o.invoiceUrl ? 'Regenerate invoice' : 'Generate invoice'}
                      </button>
                    )}
                    {(o.status === 'delivered' || o.status === 'cancelled') && !o.invoiceUrl && !canGenerateInvoice(o) ? (
                      <span className="admin-muted">—</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {totalPages > 1 && (
        <div className="admin-pager">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <span>Page {data.page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}
