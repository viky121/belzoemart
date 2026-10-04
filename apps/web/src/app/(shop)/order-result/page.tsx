'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import { formatInr } from '@/lib/catalogue-api';

interface OrderDetail {
  id: string;
  status: string;
  grandTotal: number;
  payments: { provider: string; status: string }[];
}

type View = 'loading' | 'confirmed' | 'cod' | 'awaiting' | 'failed' | 'notfound';

/** Max polls while waiting for the payment webhook to confirm the order. */
const MAX_POLLS = 12;
const POLL_MS = 2500;

function OrderResultInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { accessToken, authFetch } = useAuth();
  const orderId = params.get('orderId') ?? '';
  const provider = params.get('provider') ?? '';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [view, setView] = useState<View>('loading');
  const [polls, setPolls] = useState(0);

  const resolveView = useCallback(
    (o: OrderDetail | null): View => {
      if (!o) return 'notfound';
      if (o.status === 'cancelled') return 'failed';
      if (o.status !== 'pending') return 'confirmed'; // confirmed/packed/shipped…
      // Still pending: COD is a successful placement; online is awaiting webhook.
      const pay = o.payments[0];
      if (provider === 'cod' || pay?.provider === 'cod') return 'cod';
      return 'awaiting';
    },
    [provider],
  );

  const fetchOrder = useCallback(async () => {
    try {
      const o = await authFetch<OrderDetail>(`/orders/${orderId}`);
      setOrder(o);
      setView(resolveView(o));
      return o;
    } catch {
      setView('notfound');
      return null;
    }
  }, [authFetch, orderId, resolveView]);

  // Auth gate.
  useEffect(() => {
    if (!accessToken) {
      router.push(loginHref());
      return;
    }
    if (!orderId) {
      setView('notfound');
      return;
    }
    void fetchOrder();
  }, [accessToken, orderId, router, fetchOrder]);

  // Poll while awaiting the payment webhook.
  useEffect(() => {
    if (view !== 'awaiting' || polls >= MAX_POLLS) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      void fetchOrder();
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [view, polls, fetchOrder]);

  const stuck = view === 'awaiting' && polls >= MAX_POLLS;

  return (
    <div className="orr" data-testid="order-result">
      <div className="orr__card">
        {view === 'loading' && (
          <>
            <div className="orr__spin" aria-hidden />
            <h1 className="orr__title">Finalising your order…</h1>
            <p className="orr__sub">Just a moment.</p>
          </>
        )}

        {view === 'confirmed' && (
          <>
            <div className="orr__ic orr__ic--ok">✓</div>
            <h1 className="orr__title">Payment successful</h1>
            <p className="orr__sub">
              Your order is confirmed{order ? <> — total {formatInr(order.grandTotal)}</> : null}. A confirmation
              and invoice are on their way.
            </p>
          </>
        )}

        {view === 'cod' && (
          <>
            <div className="orr__ic orr__ic--ok">✓</div>
            <h1 className="orr__title">Order placed</h1>
            <p className="orr__sub">
              Your Cash on Delivery order is confirmed{order ? <> — pay {formatInr(order.grandTotal)} on delivery</> : null}.
            </p>
          </>
        )}

        {view === 'awaiting' && !stuck && (
          <>
            <div className="orr__spin" aria-hidden />
            <h1 className="orr__title">Confirming your payment…</h1>
            <p className="orr__sub">
              We&apos;re waiting for the payment gateway to confirm. This usually takes a few seconds — please don&apos;t
              close this page.
            </p>
          </>
        )}

        {stuck && (
          <>
            <div className="orr__ic orr__ic--wait">⏳</div>
            <h1 className="orr__title">Payment is still processing</h1>
            <p className="orr__sub">
              If money was debited, your order will confirm automatically once the gateway notifies us. You can check
              its status anytime in your orders.
            </p>
          </>
        )}

        {view === 'failed' && (
          <>
            <div className="orr__ic orr__ic--err">✕</div>
            <h1 className="orr__title">Payment not completed</h1>
            <p className="orr__sub">
              Your order wasn&apos;t charged and has been cancelled. You can try again from your cart.
            </p>
          </>
        )}

        {view === 'notfound' && (
          <>
            <div className="orr__ic orr__ic--err">!</div>
            <h1 className="orr__title">Order not found</h1>
            <p className="orr__sub">We couldn&apos;t find that order. It may belong to a different account.</p>
          </>
        )}

        <div className="orr__actions">
          {orderId && view !== 'notfound' && (
            <Link href={`/orders/${orderId}`} className="orr__btn orr__btn--primary">
              View order
            </Link>
          )}
          {(view === 'failed' || stuck) && (
            <Link href="/cart" className="orr__btn">
              Back to cart
            </Link>
          )}
          <Link href="/" className="orr__btn">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderResultPage() {
  return (
    <Suspense
      fallback={
        <div className="orr">
          <div className="orr__card">
            <div className="orr__spin" aria-hidden />
            <p className="orr__sub">Loading…</p>
          </div>
        </div>
      }
    >
      <OrderResultInner />
    </Suspense>
  );
}
