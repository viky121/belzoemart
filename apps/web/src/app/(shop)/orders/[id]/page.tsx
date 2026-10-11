'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import {
  cancelEligibility,
  isLiveStatus,
  returnEligibility,
  type OrderDetail,
} from '@/lib/order-view';
import { CancelOrderModal } from './cancel-order-modal';
import { ReturnRequestModal } from './return-request-modal';
import {
  DeliveryAddress,
  OrderHeader,
  OrderItems,
  OrderStepper,
  PriceDetails,
  ReturnRequestCard,
  TrackingCard,
} from './order-sections';

/** While the order can still move, re-fetch it this often (ms). */
const POLL_MS = 30_000;

/**
 * Customer order detail (FR-5): live status (refetched on focus and every
 * 30 s until the order is final), progress, items, price details, tracking,
 * returns, and the Cancel / Return / Reorder / Invoice actions.
 */
export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { accessToken, ready, authFetch } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<'cancel' | 'return' | null>(null);
  const [reordering, setReordering] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasData = useRef(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    try {
      const o = await authFetch<OrderDetail>(`/orders/${id}`);
      hasData.current = true;
      setOrder(o);
      setLoadError(null);
    } catch (e) {
      // Keep showing the last good data on a transient refresh failure.
      if (!hasData.current) {
        setLoadError(e instanceof Error && e.message ? e.message : 'Order not found');
      }
    } finally {
      inFlight.current = false;
    }
  }, [id, authFetch]);

  useEffect(() => {
    if (!ready) return;
    if (!accessToken) {
      router.push(loginHref());
      return;
    }
    void load();
  }, [ready, accessToken, load, router]);

  // Live refresh: whenever the shopper comes back to the tab.
  useEffect(() => {
    if (!accessToken) return;
    const onFocus = () => void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessToken, load]);

  // Live refresh: poll only while the order is not delivered/cancelled/returned.
  const live = order ? isLiveStatus(order.status) : false;
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [live, load]);

  async function reorder() {
    if (!order) return;
    setReordering(true);
    setActionError(null);
    try {
      await authFetch(`/orders/${order.id}/reorder`, { method: 'POST' });
      router.push('/cart');
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : 'Could not add these items to your cart.');
      setReordering(false);
    }
  }

  function done(message: string) {
    setModal(null);
    setMsg(message);
    void load();
  }

  if (!order) {
    if (loadError) {
      return (
        <section className="od" data-testid="order-detail">
          <div className="od-card od-empty" role="alert">
            <h1>We couldn&apos;t load this order</h1>
            <p>{loadError}</p>
            <Link href="/orders" className="btn btn--blue">
              Back to My Orders
            </Link>
          </div>
        </section>
      );
    }
    return (
      <section className="od" aria-busy="true" aria-label="Loading order">
        <div className="od-skel od-skel--head" />
        <div className="od__grid">
          <div className="od__main">
            <div className="od-skel" />
            <div className="od-skel" />
          </div>
          <div className="od__side">
            <div className="od-skel" />
          </div>
        </div>
      </section>
    );
  }

  const ret = returnEligibility(order);
  const canCancel = cancelEligibility(order);
  const showReturnReason = !ret.eligible && (order.status === 'delivered' || order.status === 'returned');

  return (
    <section className="od" data-testid="order-detail">
      <Link href="/orders" className="od__back">
        ← My Orders
      </Link>

      <OrderHeader order={order} />

      <p role="status" data-testid="order-msg" className={msg ? 'od__msg' : 'od-sr'}>
        {msg}
      </p>

      <div className="od__grid">
        <div className="od__main">
          <OrderStepper order={order} />
          <OrderItems order={order} />
          <TrackingCard order={order} />
          <ReturnRequestCard order={order} />
        </div>

        <aside className="od__side">
          <PriceDetails order={order} />
          <DeliveryAddress address={order.address} />

          <section className="od-card od-actions" aria-labelledby="od-actions-title">
            <h2 id="od-actions-title" className="od-card__title">
              Actions
            </h2>
            <button
              type="button"
              className="btn od-actions__btn"
              onClick={reorder}
              disabled={reordering}
              aria-busy={reordering}
              data-testid="order-reorder"
            >
              {reordering ? 'Adding to cart…' : 'Reorder'}
            </button>
            {order.invoiceUrl && (
              <a
                className="btn btn--outline od-actions__btn"
                href={order.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="order-invoice"
              >
                Download invoice
              </a>
            )}
            {ret.eligible && (
              <button
                type="button"
                className="btn btn--outline od-actions__btn"
                onClick={() => setModal('return')}
                data-testid="order-return"
              >
                Return / Replace
              </button>
            )}
            {showReturnReason && ret.reason && (
              <p className="od-muted od-actions__note" data-testid="order-return-unavailable">
                {ret.reason}
              </p>
            )}
            {canCancel && (
              <button
                type="button"
                className="btn btn--outline btn--danger od-actions__btn"
                onClick={() => setModal('cancel')}
                data-testid="order-cancel"
              >
                Cancel order
              </button>
            )}
            {actionError && (
              <p className="od-error" role="alert">
                {actionError}
              </p>
            )}
            <Link href="/page/contact" className="od-link od-actions__help">
              Need help with this order?
            </Link>
          </section>
        </aside>
      </div>

      {modal === 'cancel' && <CancelOrderModal order={order} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'return' && <ReturnRequestModal order={order} onClose={() => setModal(null)} onDone={done} />}
    </section>
  );
}
