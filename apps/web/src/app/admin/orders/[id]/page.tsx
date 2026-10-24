'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';
import { isUsableImageUrl, placeholderImage } from '@/lib/category-theme';

interface AdminItem {
  id: string;
  variantId: string;
  title: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  taxRatePct: number;
  offerId?: string | null;
  offerName?: string | null;
  imageUrl: string | null;
  slug: string | null;
  isReturnable: boolean;
  attributes: Record<string, string>;
}
interface AdminPayment {
  id: string;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amount: number;
  status: string;
  method: string | null;
  createdAt: string;
}
interface AdminCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
}
interface AdminAddress {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}
interface TrackingEvent {
  status: string;
  label: string;
  description: string;
  location: string | null;
  occurredAt: string | null;
  derived: boolean;
}
interface ReconciledShipment {
  id: string;
  awb: string | null;
  courier: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  providerStatus: string;
  status: string;
  statusLabel: string;
  events: TrackingEvent[];
}
interface AdminReturn {
  id: string;
  status: string;
  reason: string;
  resolution: string | null;
  images: string[];
  items: { orderItemId: string; quantity: number }[];
  createdAt: string;
}
interface AdminOrderDetail {
  id: string;
  status: string;
  createdAt: string;
  couponCode: string | null;
  cancelledReason: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  invoiceUrl: string | null;
  customer: AdminCustomer | null;
  address: AdminAddress | null;
  items: AdminItem[];
  payments: AdminPayment[];
  tracking: { latestStatus: string; latestLabel: string; shipments: ReconciledShipment[] };
  returns: AdminReturn[];
}

const STATUS_CLASS: Record<string, string> = {
  delivered: 'admin-status--ok',
  cancelled: 'admin-status--bad',
  returned: 'admin-status--bad',
  pending: 'admin-status--warn',
  confirmed: 'admin-status--info',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function variantText(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

/** Admin order detail (FR-9): customer, address, items, payment, tracking, returns. */
export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const o = await adminFetch<AdminOrderDetail>(`/admin/orders/${id}`);
      setOrder(o);
      setError(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !order) {
    return (
      <div data-testid="admin-order-detail">
        <Link href="/admin/orders" className="aod-back">← Orders</Link>
        <p className="admin-subtitle">Loading order…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div data-testid="admin-order-detail">
        <Link href="/admin/orders" className="aod-back">← Orders</Link>
        <section className="admin-card">
          <div className="admin-empty">{error ?? 'Order not found.'}</div>
        </section>
      </div>
    );
  }

  const payment = order.payments[0] ?? null;

  return (
    <div data-testid="admin-order-detail">
      <Link href="/admin/orders" className="aod-back">← Orders</Link>

      <div className="admin-card__head">
        <div>
          <h1 style={{ margin: 0 }}>Order #{order.id.slice(0, 8).toUpperCase()}</h1>
          <p className="admin-subtitle" style={{ margin: '4px 0 0' }}>Placed on {fmtDate(order.createdAt)}</p>
        </div>
        <span className={`admin-status ${STATUS_CLASS[order.status] ?? ''}`}>
          {order.status.replace(/_/g, ' ')}
        </span>
      </div>

      {order.status === 'cancelled' && order.cancelledReason && (
        <section className="admin-card">
          <strong>Cancellation reason:</strong> {order.cancelledReason}
        </section>
      )}

      <div className="aod-grid">
        {/* Customer */}
        <section className="admin-card">
          <div className="admin-card__head"><h2>Customer</h2></div>
          {order.customer ? (
            <div className="aod-info">
              <div className="aod-row"><span>Name</span><strong>{order.customer.name}</strong></div>
              <div className="aod-row"><span>Email</span><strong>{order.customer.email ?? '—'}</strong></div>
              <div className="aod-row"><span>Phone</span><strong>{order.customer.phone ?? '—'}</strong></div>
              <div className="aod-row"><span>Account</span>
                <span className={`admin-status ${order.customer.status === 'active' ? 'admin-status--ok' : 'admin-status--bad'}`}>
                  {order.customer.status}
                </span>
              </div>
              <div className="aod-row"><span>Member since</span><strong>{fmtDate(order.customer.createdAt)}</strong></div>
              <div className="aod-row"><span>Customer ID</span><code className="aod-mono">{order.customer.id}</code></div>
            </div>
          ) : (
            <div className="admin-empty">Customer record not available.</div>
          )}
        </section>

        {/* Delivery address */}
        <section className="admin-card">
          <div className="admin-card__head"><h2>Delivery address</h2></div>
          {order.address ? (
            <div className="aod-info">
              <div className="aod-row"><span>Name</span><strong>{order.address.fullName}</strong></div>
              <div className="aod-row"><span>Phone</span><strong>{order.address.phone}</strong></div>
              <div className="aod-row"><span>Address</span>
                <strong style={{ textAlign: 'right' }}>
                  {order.address.line1}
                  {order.address.line2 ? `, ${order.address.line2}` : ''}
                </strong>
              </div>
              <div className="aod-row"><span>City / State</span><strong>{order.address.city}, {order.address.state}</strong></div>
              <div className="aod-row"><span>Pincode</span><strong>{order.address.pincode}</strong></div>
              <div className="aod-row"><span>Label</span><strong>{order.address.label}</strong></div>
            </div>
          ) : (
            <div className="admin-empty">No delivery address on file.</div>
          )}
        </section>
      </div>

      {/* Items */}
      <section className="admin-card">
        <div className="admin-card__head"><h2>Items ({order.items.length})</h2></div>
        <table className="admin-table">
          <thead>
            <tr><th>Product</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr>
          </thead>
          <tbody>
            {order.items.map((i) => {
              const img = isUsableImageUrl(i.imageUrl) ? i.imageUrl : placeholderImage(i.title, i.variantId || i.id);
              const vt = variantText(i.attributes);
              return (
                <tr key={i.id}>
                  <td>
                    <div className="aod-prod">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="aod-item-img" src={img} alt="" />
                      <div>
                        {i.slug ? (
                          <Link href={`/product/${i.slug}`} target="_blank" rel="noreferrer" className="aod-prod-title">
                            {i.title}
                          </Link>
                        ) : (
                          <span className="aod-prod-title">{i.title}</span>
                        )}
                        {vt && <div className="admin-muted" style={{ fontSize: '0.8rem' }}>{vt}</div>}
                        {i.offerName && <div className="admin-muted" style={{ fontSize: '0.8rem' }}>🎁 Offer price · {i.offerName}</div>}
                        <span className={`admin-status ${i.isReturnable ? 'admin-status--info' : ''}`} style={{ marginTop: 4 }}>
                          {i.isReturnable ? 'Returnable' : 'Non-returnable'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td><code className="aod-mono">{i.sku}</code></td>
                  <td>{i.quantity}</td>
                  <td>{formatInr(i.unitPrice)}</td>
                  <td><strong>{formatInr(i.unitPrice * i.quantity)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="aod-grid">
        {/* Price details */}
        <section className="admin-card">
          <div className="admin-card__head"><h2>Price details</h2></div>
          <div className="aod-info">
            <div className="aod-row"><span>Subtotal</span><strong>{formatInr(order.subtotal)}</strong></div>
            {order.discount > 0 && (
              <div className="aod-row">
                <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                <strong>−{formatInr(order.discount)}</strong>
              </div>
            )}
            <div className="aod-row"><span>Delivery</span><strong>{order.shipping > 0 ? formatInr(order.shipping) : 'FREE'}</strong></div>
            {order.codFee > 0 && <div className="aod-row"><span>COD fee</span><strong>{formatInr(order.codFee)}</strong></div>}
            <div className="aod-row"><span>Tax (incl.)</span><strong>{formatInr(order.tax)}</strong></div>
            <div className="aod-row aod-row--total"><span>Grand total</span><strong>{formatInr(order.grandTotal)}</strong></div>
          </div>
        </section>

        {/* Payment */}
        <section className="admin-card">
          <div className="admin-card__head"><h2>Payment</h2></div>
          {payment ? (
            <div className="aod-info">
              <div className="aod-row"><span>Method</span><strong>{(payment.method ?? payment.provider).toUpperCase()}</strong></div>
              <div className="aod-row"><span>Status</span>
                <span className={`admin-status ${payment.status === 'captured' ? 'admin-status--ok' : payment.status === 'failed' ? 'admin-status--bad' : 'admin-status--warn'}`}>
                  {payment.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="aod-row"><span>Amount</span><strong>{formatInr(payment.amount)}</strong></div>
              <div className="aod-row"><span>Provider</span><strong>{payment.provider}</strong></div>
              {payment.providerPaymentId && (
                <div className="aod-row"><span>Payment ID</span><code className="aod-mono">{payment.providerPaymentId}</code></div>
              )}
              <div className="aod-row"><span>Paid at</span><strong>{fmtDate(payment.createdAt)}</strong></div>
            </div>
          ) : (
            <div className="admin-empty">No payment recorded.</div>
          )}
          {order.invoiceUrl && (
            <a className="aod-back" style={{ marginTop: 12, display: 'inline-block' }} href={order.invoiceUrl} target="_blank" rel="noreferrer">
              Download invoice ↗
            </a>
          )}
        </section>
      </div>

      {/* Shipment & tracking */}
      <section className="admin-card">
        <div className="admin-card__head"><h2>Shipment &amp; tracking</h2></div>
        {order.tracking.shipments.length === 0 ? (
          <div className="admin-empty">No shipment created yet.</div>
        ) : (
          order.tracking.shipments.map((s) => (
            <div key={s.id} className="aod-ship">
              <div className="aod-info">
                <div className="aod-row"><span>Courier</span><strong>{s.courier ?? '—'}</strong></div>
                <div className="aod-row"><span>AWB</span><code className="aod-mono">{s.awb ?? '—'}</code></div>
                <div className="aod-row"><span>Status</span><strong>{s.statusLabel}</strong></div>
                {s.estimatedDelivery && (
                  <div className="aod-row"><span>Est. delivery</span><strong>{fmtDate(s.estimatedDelivery)}</strong></div>
                )}
              </div>
              {s.events.length > 0 && (
                <ul className="aod-timeline">
                  {s.events.map((e, idx) => (
                    <li key={`${s.id}-${idx}`}>
                      <strong>{e.label}</strong>
                      {e.description && e.description !== e.label ? ` — ${e.description}` : ''}
                      <span className="admin-muted">
                        {' '}
                        {e.location ? `· ${e.location} ` : ''}
                        {e.occurredAt ? `· ${fmtDate(e.occurredAt)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </section>

      {/* Returns */}
      {order.returns.length > 0 && (
        <section className="admin-card">
          <div className="admin-card__head"><h2>Return requests ({order.returns.length})</h2></div>
          {order.returns.map((r) => (
            <div key={r.id} className="aod-info" style={{ marginBottom: 12 }}>
              <div className="aod-row"><span>Status</span><strong>{r.status}</strong></div>
              <div className="aod-row"><span>Reason</span><strong>{r.reason}</strong></div>
              {r.resolution && <div className="aod-row"><span>Resolution</span><strong>{r.resolution.replace(/_/g, ' ')}</strong></div>}
              <div className="aod-row"><span>Requested</span><strong>{fmtDate(r.createdAt)}</strong></div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
