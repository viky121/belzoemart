'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatInr } from '@/lib/catalogue-api';
import { isUsableImageUrl, placeholderImage } from '@/lib/category-theme';
import { breakupView } from '@/lib/price-breakup';
import {
  buildStepper,
  formatDate,
  formatDateTime,
  paymentSummary,
  resolutionLabel,
  returnStatusLabel,
  returnStatusTone,
  shortOrderId,
  statusBadge,
  variantText,
  type OrderAddress,
  type OrderDetail,
} from '@/lib/order-view';

/** Small "Copy" button with an aria-live confirmation. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button type="button" className="od-copy" onClick={copy} aria-label={label}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="od-sr" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </>
  );
}

export function OrderHeader({ order }: { order: OrderDetail }) {
  const badge = statusBadge(order.status);
  const pay = paymentSummary(order);
  return (
    <header className="od-card od-head">
      <div className="od-head__main">
        <div className="od-head__title">
          <h1>Order #{shortOrderId(order.id)}</h1>
          <CopyButton value={order.id} label="Copy full order ID" />
        </div>
        <p className="od-head__meta">Placed on {formatDateTime(order.createdAt) ?? '—'}</p>
        <p className="od-head__meta">
          Payment: <strong>{pay.methodLabel}</strong> · {pay.statusLabel}
        </p>
        {order.status === 'cancelled' && order.cancelledReason && (
          <p className="od-head__reason">Cancellation reason: {order.cancelledReason}</p>
        )}
      </div>
      <span className={`ord-badge ord-badge--${badge.tone} od-head__badge`} data-testid="order-status">
        {badge.label}
      </span>
    </header>
  );
}

export function OrderStepper({ order }: { order: OrderDetail }) {
  const steps = buildStepper(order);
  return (
    <section className="od-card" aria-labelledby="od-progress-title">
      <h2 id="od-progress-title" className="od-card__title">
        Order status
      </h2>
      <ol className="od-stepper" aria-label="Order progress">
        {steps.map((s) => {
          const complete = s.state === 'done' || (s.state === 'current' && s.key === 'delivered');
          const cls = [
            'od-step',
            `od-step--${s.state}`,
            complete ? 'is-complete' : '',
            s.state === 'terminal' ? `od-step--${s.key}` : '',
          ]
            .filter(Boolean)
            .join(' ');
          const when = formatDateTime(s.at);
          return (
            <li key={s.key} className={cls} aria-current={s.state === 'current' ? 'step' : undefined}>
              <span className="od-step__dot" aria-hidden="true">
                {complete || s.state === 'terminal' ? (s.key === 'cancelled' ? '×' : '✓') : ''}
              </span>
              <span className="od-step__text">
                <span className="od-step__label">{s.label}</span>
                {when && <span className="od-step__at">{when}</span>}
                <span className="od-sr">
                  {s.state === 'done' || complete ? ' (completed)' : s.state === 'current' ? ' (current)' : s.state === 'upcoming' ? ' (upcoming)' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function OrderItems({ order }: { order: OrderDetail }) {
  return (
    <section className="od-card" aria-labelledby="od-items-title">
      <h2 id="od-items-title" className="od-card__title">
        Items ({order.items.length})
      </h2>
      <ul className="od-items">
        {order.items.map((i) => {
          const img = isUsableImageUrl(i.imageUrl) ? i.imageUrl : placeholderImage(i.title, i.variantId || i.id);
          const href = i.slug ? `/product/${i.slug}` : null;
          const vt = variantText(i.attributes);
          // eslint-disable-next-line @next/next/no-img-element
          const image = <img src={img} alt="" />;
          return (
            <li key={i.id} className="od-item">
              {href ? (
                <Link href={href} className="od-item__img" tabIndex={-1} aria-hidden="true">
                  {image}
                </Link>
              ) : (
                <span className="od-item__img">{image}</span>
              )}
              <div className="od-item__info">
                {href ? (
                  <Link href={href} className="od-item__title">
                    {i.title}
                  </Link>
                ) : (
                  <span className="od-item__title">{i.title}</span>
                )}
                {vt && <span className="od-item__meta">{vt}</span>}
                <span className="od-item__meta">SKU {i.sku}</span>
                <span className="od-item__meta">
                  {i.quantity} × {formatInr(i.unitPrice)}
                </span>
                <span className={`od-tag ${i.isReturnable ? 'od-tag--ok' : 'od-tag--muted'}`}>
                  {i.isReturnable ? 'Returnable' : 'Non-returnable'}
                </span>
              </div>
              <span className="od-item__total">{formatInr(i.unitPrice * i.quantity)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PriceDetails({ order }: { order: OrderDetail }) {
  const view = breakupView(order);
  const pay = paymentSummary(order);
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <section className="od-card" aria-labelledby="od-price-title">
      <h2 id="od-price-title" className="od-card__title">
        Price details
      </h2>
      <dl className="od-price">
        {view.rows.map((r) => {
          let label = r.label;
          let value = formatInr(r.amount);
          if (r.key === 'subtotal') label = `Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})`;
          if (r.key === 'discount') {
            label = order.couponCode ? `Discount (code ${order.couponCode})` : 'Discount';
            value = `−${formatInr(-r.amount)}`;
          }
          if (r.key === 'shipping') {
            label = 'Delivery';
            if (r.amount === 0) value = 'FREE';
          }
          return (
            <div key={r.key} className={`od-price__row${r.key === 'discount' || (r.key === 'shipping' && r.amount === 0) ? ' is-saving' : ''}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          );
        })}
        <div className="od-price__row od-price__total">
          <dt>Order total</dt>
          <dd>{formatInr(view.grandTotal)}</dd>
        </div>
      </dl>
      {view.gstNote && (
        <p className="od-price__note" data-testid="order-gst-included">
          {view.gstNote.label} {formatInr(view.gstNote.amount)}
        </p>
      )}
      <div className="od-price__paid">
        {pay.isPrepaid ? (
          pay.amountPaid > 0 ? (
            <>
              <span>Amount paid</span>
              <strong>{formatInr(pay.amountPaid)}</strong>
            </>
          ) : (
            <>
              <span>Payment</span>
              <strong>{pay.statusLabel}</strong>
            </>
          )
        ) : pay.isCod ? (
          order.status === 'delivered' || order.status === 'returned' ? (
            <>
              <span>Cash on Delivery</span>
              <strong>Paid on delivery</strong>
            </>
          ) : order.status === 'cancelled' ? (
            <>
              <span>Cash on Delivery</span>
              <strong>Not charged</strong>
            </>
          ) : (
            <>
              <span>To pay on delivery</span>
              <strong>{formatInr(view.grandTotal)}</strong>
            </>
          )
        ) : (
          <>
            <span>Payment</span>
            <strong>{pay.statusLabel}</strong>
          </>
        )}
      </div>
    </section>
  );
}

export function DeliveryAddress({ address }: { address: OrderAddress | null }) {
  return (
    <section className="od-card" aria-labelledby="od-address-title">
      <h2 id="od-address-title" className="od-card__title">
        Delivery address
      </h2>
      {address ? (
        <address className="od-address">
          <strong>{address.fullName}</strong>
          <span>{address.line1}</span>
          {address.line2 && <span>{address.line2}</span>}
          <span>
            {address.city}, {address.state} {address.pincode}
          </span>
          <span>Phone: {address.phone}</span>
        </address>
      ) : (
        <p className="od-muted">Address details are not available for this order.</p>
      )}
    </section>
  );
}

const HTTP_URL = /^https?:\/\//i;

export function TrackingCard({ order }: { order: OrderDetail }) {
  const shipments = order.tracking?.shipments ?? [];
  if (shipments.length === 0 && order.status === 'cancelled') return null;
  const terminal = order.status === 'cancelled' || order.status === 'returned';
  return (
    <section className="od-card" aria-labelledby="od-track-title" data-testid="order-tracking">
      <h2 id="od-track-title" className="od-card__title">
        Shipment &amp; tracking
      </h2>
      {shipments.length === 0 ? (
        <p className="od-muted">Your order will be shipped soon. Tracking details will appear here.</p>
      ) : (
        shipments.map((s, idx) => {
          const badge = statusBadge(s.status);
          const eta = s.status !== 'delivered' && !terminal ? formatDate(s.estimatedDelivery) : null;
          return (
            <div key={s.id} className="od-ship">
              {shipments.length > 1 && <h3 className="od-ship__title">Package {idx + 1}</h3>}
              <dl className="od-ship__meta">
                <div>
                  <dt>Courier</dt>
                  <dd>{s.courier ?? 'Courier partner'}</dd>
                </div>
                <div>
                  <dt>AWB</dt>
                  <dd>
                    {s.awb ? (
                      <>
                        <span className="od-mono">{s.awb}</span> <CopyButton value={s.awb} label="Copy AWB number" />
                      </>
                    ) : (
                      'Not assigned yet'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`ord-badge ord-badge--${badge.tone}`}>{s.statusLabel}</span>
                  </dd>
                </div>
                {eta && (
                  <div>
                    <dt>Estimated delivery</dt>
                    <dd>{eta}</dd>
                  </div>
                )}
              </dl>
              {s.trackingUrl && HTTP_URL.test(s.trackingUrl) && (
                <a className="od-link" href={s.trackingUrl} target="_blank" rel="noopener noreferrer">
                  Track on courier site<span className="od-sr"> (opens in a new tab)</span>
                </a>
              )}
              {s.events.length > 0 && (
                <ol className="od-timeline" aria-label={`Tracking history${shipments.length > 1 ? ` for package ${idx + 1}` : ''}`}>
                  {s.events.map((e, i) => (
                    <li key={`${e.status}-${e.occurredAt ?? 'na'}-${i}`} className={`od-timeline__item${i === 0 ? ' is-latest' : ''}`}>
                      <span className="od-timeline__label">{e.label}</span>
                      {e.description && e.description !== e.label && (
                        <span className="od-timeline__desc">{e.description}</span>
                      )}
                      <span className="od-timeline__meta">
                        {e.location ? `${e.location} · ` : ''}
                        {formatDateTime(e.occurredAt) ?? 'Time not available'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

export function ReturnRequestCard({ order }: { order: OrderDetail }) {
  if (order.returns.length === 0) return null;
  const titles = new Map(order.items.map((i) => [i.id, i.title]));
  return (
    <section className="od-card" aria-labelledby="od-returns-title" data-testid="order-returns">
      <h2 id="od-returns-title" className="od-card__title">
        Return requests
      </h2>
      <ul className="od-returns">
        {order.returns.map((r) => (
          <li key={r.id} className="od-return">
            <div className="od-return__head">
              <span className={`ord-badge ord-badge--${returnStatusTone(r.status)}`}>{returnStatusLabel(r.status)}</span>
              <span className="od-muted">Requested on {formatDateTime(r.createdAt) ?? '—'}</span>
            </div>
            <dl className="od-summary">
              <div>
                <dt>Resolution</dt>
                <dd>{resolutionLabel(r.resolution)}</dd>
              </div>
              {r.items.length > 0 && (
                <div>
                  <dt>Items</dt>
                  <dd>
                    {r.items.map((it) => `${titles.get(it.orderItemId) ?? 'Item'} × ${it.quantity}`).join(', ')}
                  </dd>
                </div>
              )}
              <div>
                <dt>Reason</dt>
                <dd>{r.reason}</dd>
              </div>
            </dl>
            {r.images.length > 0 && (
              <div className="od-photos od-photos--sm">
                {r.images.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="od-thumb-link">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Return photo ${i + 1} (opens full image)`} className="od-thumb" />
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
