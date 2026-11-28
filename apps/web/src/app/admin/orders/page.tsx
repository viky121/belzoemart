'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';
import {
  formatPickupSlot,
  orderStatusLabel,
  orderStatusView,
  paymentMethodLabel,
  paymentProviderLabel,
  paymentStatusView,
  pickPayment,
  type PaymentLike,
} from '@belzo/shared';
import { canCreateShipment, nextStep, pendingAction } from '@/lib/admin-order-actions';

interface AdminOrder {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  invoiceUrl: string | null;
  payments?: PaymentLike[];
  /** 'pickup' = the customer collects it from the shop. */
  fulfilment?: 'delivery' | 'pickup';
  pickupSlotStart?: string | null;
  pickupSlotEnd?: string | null;
  isTest?: boolean;
  customer?: { id: string; name: string; phone: string | null } | null;
}
interface Paged {
  testCount?: number;
  items: AdminOrder[];
  total: number;
  page: number;
  pageSize: number;
}

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

/** "→ shipped" → "→ Shipped", "Ready for pickup" stays as it is. */
function sentenceCase(label: string): string {
  return label.replace(/^(→\s*)?([a-z])/, (_m, arrow: string | undefined, c: string) => `${arrow ?? ''}${c.toUpperCase()}`);
}

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
  const [testOnly, setTestOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (testOnly) params.set('test', 'only');
    setData(
      await adminFetch<Paged>(`/admin/orders?${params.toString()}`).catch(() => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      })),
    );
  }, [status, q, page, testOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markTest(isTest: boolean) {
    if (selected.length === 0) return;
    try {
      const res = await adminFetch<{ changed: number }>('/admin/orders/mark-test', {
        method: 'POST',
        body: { ids: selected, isTest },
      });
      setMsg(isTest ? `${res.changed} order(s) marked as test and hidden from reports` : `${res.changed} order(s) put back as real orders`);
      setSelected([]);
      void load();
    } catch (e) {
      setMsg(`Could not update: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function advance(o: AdminOrder) {
    const step = nextStep(o.status, o.fulfilment);
    if (!step) return;
    await adminFetch(`/admin/orders/${o.id}/status`, { method: 'PATCH', body: { status: step.next } });
    setMsg(`Order ${o.id.slice(0, 8)} → ${orderStatusLabel(step.next, o.fulfilment).toLowerCase()}`);
    void load();
  }

  /** A pending Cash on Delivery order has nothing to wait for: the admin confirms it by hand. */
  async function confirmCod(o: AdminOrder) {
    setBusyId(o.id);
    try {
      await adminFetch(`/admin/orders/${o.id}/confirm`, { method: 'POST' });
      setMsg(`Order #${o.id.slice(0, 8).toUpperCase()} confirmed`);
      void load();
    } catch (e) {
      setMsg(`Could not confirm the order: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyId(null);
    }
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
      <div className="aol-head">
        <div>
          <h1>Orders</h1>
          <p className="admin-subtitle">Track orders and payments, move orders forward and create shipments.</p>
        </div>
      </div>
      {msg && <p role="status" className="aol-msg" data-testid="orders-msg">{msg}</p>}
      <div className="admin-tabs" data-testid="orders-tabs">
        {TABS.map((t) => (
          <button
            key={t.key || 'all'}
            className={`admin-tab${!testOnly && status === t.key ? ' is-on' : ''}`}
            onClick={() => {
              setTestOnly(false);
              setStatus(t.key);
              setPage(1);
              setSelected([]);
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          className={`admin-tab${testOnly ? ' is-on' : ''}`}
          data-testid="orders-tab-test"
          onClick={() => {
            setTestOnly(true);
            setStatus('');
            setPage(1);
            setSelected([]);
          }}
        >
          Test orders{data.testCount ? ` (${data.testCount})` : ''}
        </button>
      </div>
      <div className="aol-toolbar">
        <input
          className="aol-search"
          placeholder="Search by order ID…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          data-testid="orders-search"
        />
        <span className="admin-muted">{data.total} {data.total === 1 ? 'order' : 'orders'}</span>
        {selected.length > 0 && (
          <button className="aol-btn" onClick={() => markTest(!testOnly)} data-testid="orders-mark-test">
            {testOnly ? `Put back ${selected.length} as real` : `Mark ${selected.length} as test`}
          </button>
        )}
      </div>
      <section className="admin-card aol-card">
        {data.items.length === 0 ? (
          <div className="admin-empty" data-testid="orders-empty">No orders found.</div>
        ) : (
          <div className="aol-scroll">
            <table className="admin-table aol-table" data-testid="orders-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={data.items.length > 0 && selected.length === data.items.length}
                      onChange={(e) => setSelected(e.target.checked ? data.items.map((x) => x.id) : [])}
                    />
                  </th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Placed</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className="aol-num">Total</th>
                  <th className="aol-num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => {
                  const pay = pickPayment(o.payments);
                  const payView = paymentStatusView({ orderStatus: o.status, fulfilment: o.fulfilment, payment: pay });
                  const statusView = orderStatusView({ status: o.status, fulfilment: o.fulfilment, payments: o.payments, audience: 'admin' });
                  const provider = paymentProviderLabel(pay);
                  const placed = new Date(o.createdAt);
                  const pending = pendingAction(o.status, o.payments ?? []);
                  const step = nextStep(o.status, o.fulfilment);
                  return (
                    <tr key={o.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select order ${o.id.slice(0, 8)}`}
                          checked={selected.includes(o.id)}
                          onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id)))}
                          data-testid={`select-${o.id}`}
                        />
                      </td>
                      <td>
                        <div className="aol-cell">
                          <Link href={`/admin/orders/${o.id}`} className="aol-id" data-testid={`order-link-${o.id}`}>
                            #{o.id.slice(0, 8).toUpperCase()}
                          </Link>
                          {o.isTest && <span className="admin-status admin-status--warn">Test</span>}
                          {o.fulfilment === 'pickup' && (
                            <span className="aol-pickup" data-testid={`pickup-tag-${o.id}`}>
                              <span className="admin-status admin-status--info">Pickup</span>
                              <span className="aol-sub">{formatPickupSlot(o.pickupSlotStart, o.pickupSlotEnd) ?? ''}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="aol-cell" data-testid={`customer-${o.id}`}>
                          {o.customer ? (
                            <span className="aol-customer">{o.customer.name || 'Customer'}</span>
                          ) : (
                            <span className="admin-muted">—</span>
                          )}
                          {o.customer?.phone && <span className="aol-sub">{o.customer.phone}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="aol-cell">
                          <span>{placed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <span className="aol-sub">{placed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td>
                        <div className="aol-cell" data-testid={`payment-${o.id}`} title={payView.adminNote ?? undefined}>
                          <span className={`admin-status admin-status--plain admin-status--${payView.tone}`}>{payView.label}</span>
                          <span className="aol-sub">
                            {paymentMethodLabel(pay, o.fulfilment)}
                            {provider ? ` · ${provider}` : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-status admin-status--plain admin-status--${statusView.tone}`} data-testid={`status-${o.id}`}>
                          {statusView.label}
                        </span>
                      </td>
                      <td className="aol-num aol-total">{formatInr(o.grandTotal)}</td>
                      <td className="aol-num">
                        <div className="aol-actions">
                          {(pending === 'confirm_cod' || pending === 'waiting_payment' || canCreateShipment(o.status, o.fulfilment) || step) && (
                            <div className="aol-actions__row">
                              {pending === 'confirm_cod' && (
                                <button className="aol-btn aol-btn--primary" onClick={() => confirmCod(o)} disabled={busyId === o.id} data-testid={`confirm-${o.id}`}>
                                  {busyId === o.id ? 'Confirming…' : 'Confirm order'}
                                </button>
                              )}
                              {pending === 'waiting_payment' && (
                                <span className="aol-wait" data-testid={`waiting-${o.id}`}>
                                  {payView.key === 'failed' ? 'Customer can retry' : 'Waiting for payment'}
                                </span>
                              )}
                              {canCreateShipment(o.status, o.fulfilment) && (
                                <button className="aol-btn" onClick={() => createShipment(o)} data-testid={`ship-${o.id}`}>
                                  Create shipment
                                </button>
                              )}
                              {step && (
                                <button className="aol-btn aol-btn--primary" onClick={() => advance(o)} data-testid={`advance-${o.id}`}>
                                  {sentenceCase(step.label)}
                                </button>
                              )}
                            </div>
                          )}
                          <div className="aol-actions__row">
                            <Link href={`/admin/orders/${o.id}`} className="aol-btn aol-btn--ghost" data-testid={`order-view-${o.id}`}>
                              View
                            </Link>
                            {o.invoiceUrl && (
                              <a href={o.invoiceUrl} target="_blank" rel="noreferrer" className="aol-btn aol-btn--ghost" data-testid={`invoice-${o.id}`}>
                                Invoice
                              </a>
                            )}
                            {(o.invoiceUrl || canGenerateInvoice(o)) && (
                              <button
                                className="aol-btn aol-btn--icon"
                                onClick={() => regenerateInvoice(o)}
                                disabled={busyId === o.id}
                                title={o.invoiceUrl ? 'Regenerate invoice with the current store details' : 'Generate invoice'}
                                aria-label={o.invoiceUrl ? 'Regenerate invoice' : 'Generate invoice'}
                                data-testid={`regen-invoice-${o.id}`}
                              >
                                {busyId === o.id ? '…' : o.invoiceUrl ? '↻' : '＋ Invoice'}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
