'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { formatInr } from '@/lib/catalogue-api';
import { placeholderImage, isUsableImageUrl } from '@/lib/category-theme';
import { orderStatusView, paymentStatusView, pickPayment, type PaymentLike } from '@belzo/shared';

interface OrderItem {
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  imageUrl: string | null;
  slug: string | null;
}
interface OrderSummary {
  id: string;
  status: string;
  /** 'pickup' = collected from the shop. */
  fulfilment?: 'delivery' | 'pickup';
  grandTotal: number;
  createdAt: string;
  itemCount: number;
  imageUrl: string | null;
  items: OrderItem[];
  /** How the order is paid (no provider ids). Missing on an older API. */
  payments?: PaymentLike[];
}

const TABS = [
  { key: 'all', label: 'All Orders' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** Bucket the many backend statuses into the four customer-facing tabs. */
function bucket(status: string): 'pending' | 'processing' | 'delivered' | 'cancelled' {
  const s = status.toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'cancelled' || s === 'returned' || s === 'refunded') return 'cancelled';
  if (s === 'pending' || s === 'created') return 'pending';
  return 'processing';
}

/** Badge (same labels/tones as the order-detail page) + a factual one-liner (no invented dates). */
function statusMeta(o: OrderSummary): { label: string; cls: string; msg: string; canPay: boolean } {
  const { status, fulfilment } = o;
  const { label, tone } = orderStatusView({ status, fulfilment, payments: o.payments, audience: 'customer' });
  const cls = `ord-badge--${tone}`;
  const pay = paymentStatusView({ orderStatus: status, fulfilment, payment: pickPayment(o.payments) });
  const none = { canPay: false };
  if (status === 'delivered') return { label, cls, msg: fulfilment === 'pickup' ? 'Picked up' : 'Delivered', ...none };
  if (status === 'cancelled') {
    const why = pay.key === 'failed' ? 'Cancelled - payment failed' : pay.key === 'not_completed' ? 'Cancelled - payment not completed' : 'Order cancelled';
    return { label, cls, msg: why, ...none };
  }
  if (status === 'returned') return { label, cls, msg: 'Returned', ...none };
  if (status === 'pending') {
    if (pay.key === 'failed') return { label, cls, msg: 'Payment failed - pay again to confirm', canPay: true };
    if (pay.key === 'awaiting') return { label, cls, msg: 'Waiting for your payment', canPay: true };
    return { label, cls, msg: 'Preparing for dispatch', ...none };
  }
  if (fulfilment === 'pickup' && status === 'packed') return { label, cls, msg: 'Collect it from the shop', ...none };
  if (status === 'shipped' || status === 'out_for_delivery') return { label, cls, msg: `${label} - on the way`, ...none };
  return { label, cls, msg: 'Being prepared', ...none };
}

export default function OrdersPage() {
  const { accessToken, authFetch } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const o = await authFetch<OrderSummary[]>('/orders').catch(() => [] as OrderSummary[]);
    setOrders(o);
    setLoaded(true);
  }, [authFetch]);

  useEffect(() => {
    if (accessToken) void load();
  }, [accessToken, load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length, pending: 0, processing: 0, delivered: 0, cancelled: 0 };
    for (const o of orders) c[bucket(o.status)] += 1;
    return c;
  }, [orders]);

  const filtered = orders.filter(
    (o) =>
      (tab === 'all' || bucket(o.status) === tab) &&
      (!q || o.id.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <section className="ord" data-testid="orders-page">
      <div className="ord__head">
        <div>
          <h1>My Orders</h1>
          <p>View and track your orders, manage returns and more.</p>
        </div>
        <input
          className="ord__search"
          placeholder="Search by order ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="orders-search"
        />
      </div>

      <div className="ord__tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`ord__tab${tab === t.key ? ' is-on' : ''}`}
            onClick={() => setTab(t.key)}
            data-testid={`orders-tab-${t.key}`}
          >
            {t.label} <span>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {loaded && orders.length === 0 ? (
        <p className="ord__empty" data-testid="orders-empty">
          You have no orders yet. <Link href="/">Start shopping</Link>
        </p>
      ) : (
        <ul className="ord__list">
          {filtered.map((o) => {
            const meta = statusMeta(o);
            const real = isUsableImageUrl(o.imageUrl);
            const placed = new Date(o.createdAt).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <li key={o.id} className="ord-row" data-testid={`order-row-${o.id}`}>
                <div className="ord-row__img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={real ? o.imageUrl! : placeholderImage(o.items[0]?.title ?? 'Order', o.id)}
                    alt={o.items[0]?.title ?? 'Order'}
                  />
                </div>
                <div className="ord-row__info">
                  <span className="ord-row__id">Order ID: #{o.id.slice(0, 8).toUpperCase()}</span>
                  <span className="ord-row__meta">Placed on {placed}</span>
                  <span className="ord-row__meta">
                    {o.itemCount} item{o.itemCount !== 1 ? 's' : ''} · {formatInr(o.grandTotal)}
                  </span>
                  {o.items[0] && (
                    <span className="ord-row__sku">
                      {o.items[0].title}
                      {o.items[0].sku ? ` · SKU ${o.items[0].sku}` : ''}
                      {o.items.length > 1 ? ` +${o.items.length - 1} more` : ''}
                    </span>
                  )}
                </div>
                <div className="ord-row__right">
                  <span className={`ord-badge ${meta.cls}`}>{meta.label}</span>
                  <span className="ord-row__eta">{meta.msg}</span>
                  {meta.canPay && (
                    <Link
                      href={`/order-result?orderId=${o.id}&provider=razorpay&dismissed=1`}
                      className="ord-row__view ord-row__pay"
                      data-testid={`order-pay-${o.id}`}
                    >
                      Pay now
                    </Link>
                  )}
                  <Link href={`/orders/${o.id}`} className="ord-row__view">
                    View Details ›
                  </Link>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && loaded && (
            <p className="ord__empty">No orders in this category.</p>
          )}
        </ul>
      )}
    </section>
  );
}
