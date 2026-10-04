'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import { formatInr } from '@/lib/catalogue-api';

interface OrderDetail {
  id: string;
  status: string;
  grandTotal: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  invoiceUrl: string | null;
  items: { id: string; title: string; sku: string; quantity: number; unitPrice: number }[];
  shipments: { id: string; awb: string | null; courier: string | null; status: string; events: { status: string; description: string; occurredAt: string }[] }[];
}

const CANCELLABLE = ['pending', 'confirmed'];

/** Order detail with tracking timeline, invoice, cancel, return, reorder (FR-5). */
export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { accessToken, authFetch } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!params?.id) return;
    const o = await authFetch<OrderDetail>(`/orders/${params.id}`).catch(() => null);
    setOrder(o);
  }, [params, authFetch]);

  useEffect(() => {
    if (!accessToken) {
      router.push(loginHref());
      return;
    }
    void load();
  }, [accessToken, load, router]);

  async function cancel() {
    if (!order) return;
    await authFetch(`/orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Changed my mind' } });
    setMsg('Order cancelled. Refund (if paid) has been initiated.');
    void load();
  }

  async function requestReturn() {
    if (!order) return;
    await authFetch('/orders/returns', { method: 'POST', body: { orderId: order.id, reason: 'Not as expected' } });
    setMsg('Return requested. We will schedule a pickup.');
  }

  async function reorder() {
    if (!order) return;
    await authFetch(`/orders/${order.id}/reorder`, { method: 'POST' });
    router.push('/cart');
  }

  if (!order) return <p style={{ padding: '2rem 0' }}>Loading…</p>;

  return (
    <section style={{ padding: '1.5rem 0' }} data-testid="order-detail">
      <h1>Order #{order.id.slice(0, 8)}</h1>
      <p data-testid="order-status">Status: <strong>{order.status}</strong></p>
      {msg && <p role="status" data-testid="order-msg">{msg}</p>}

      <h2>Items</h2>
      <ul>
        {order.items.map((i) => (
          <li key={i.id}>{i.title} × {i.quantity} — {formatInr(i.unitPrice * i.quantity)}</li>
        ))}
      </ul>

      <div className="price-breakup">
        <p>Subtotal: {formatInr(order.subtotal)}</p>
        {order.discount > 0 && <p>Discount: −{formatInr(order.discount)}</p>}
        <p>Shipping: {order.shipping === 0 ? 'FREE' : formatInr(order.shipping)}</p>
        <p>Tax: {formatInr(order.tax)}</p>
        <p><strong>Total: {formatInr(order.grandTotal)}</strong></p>
      </div>

      {order.shipments.length > 0 && (
        <div data-testid="order-tracking">
          <h2>Tracking</h2>
          {order.shipments.map((s) => (
            <div key={s.id}>
              <p>AWB: {s.awb ?? '—'} ({s.courier ?? 'courier'}) · {s.status}</p>
              <ol className="tracking-timeline">
                {s.events.map((e, idx) => (
                  <li key={idx}>
                    <strong>{e.status}</strong> — {e.description} <span>({new Date(e.occurredAt).toLocaleString()})</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      <div className="order-actions" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        {order.invoiceUrl && (
          <a className="btn" href={order.invoiceUrl} target="_blank" rel="noreferrer" data-testid="order-invoice">
            Download invoice
          </a>
        )}
        {CANCELLABLE.includes(order.status) && (
          <button className="btn" onClick={cancel} data-testid="order-cancel">Cancel order</button>
        )}
        {order.status === 'delivered' && (
          <button className="btn" onClick={requestReturn} data-testid="order-return">Return / replace</button>
        )}
        <button className="btn" onClick={reorder} data-testid="order-reorder">Reorder</button>
      </div>
    </section>
  );
}
