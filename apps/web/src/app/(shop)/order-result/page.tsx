'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import { formatInr } from '@/lib/catalogue-api';
import { openRazorpayCheckout, verifyBody, type RazorpayClientConfig } from '@/lib/razorpay';

interface OrderDetail {
  id: string;
  status: string;
  grandTotal: number;
  payments: { provider: string; status: string }[];
}

type View = 'loading' | 'confirmed' | 'cod' | 'awaiting' | 'failed' | 'notfound';

/** Max polls while waiting for the payment to be confirmed. */
const MAX_POLLS = 12;
const POLL_MS = 2500;

function OrderResultInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { accessToken, authFetch } = useAuth();
  const orderId = params.get('orderId') ?? '';
  const provider = params.get('provider') ?? '';
  // The customer closed the payment window without paying.
  const dismissed = params.get('dismissed') === '1';

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [view, setView] = useState<View>('loading');
  const [polls, setPolls] = useState(0);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const resolveView = useCallback(
    (o: OrderDetail | null): View => {
      if (!o) return 'notfound';
      if (o.status === 'cancelled') return 'failed';
      if (o.status !== 'pending') return 'confirmed'; // confirmed/packed/shipped…
      // Still pending: COD is a successful placement; online is awaiting payment.
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

  /** Ask the server to check with the payment gateway (works even if its webhook is late). */
  const syncPayment = useCallback(async () => {
    try {
      await authFetch(`/payments/${orderId}/sync`, { method: 'POST' });
    } catch {
      /* the next poll tries again */
    }
  }, [authFetch, orderId]);

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
    void (async () => {
      // A customer arriving from a payment may already have paid: confirm before showing anything.
      if (provider !== 'cod') await syncPayment();
      await fetchOrder();
    })();
  }, [accessToken, orderId, provider, router, fetchOrder, syncPayment]);

  // Poll while awaiting payment confirmation (not while the customer is deciding what to do next).
  const waiting = view === 'awaiting' && !dismissed && !paying;
  useEffect(() => {
    if (!waiting || polls >= MAX_POLLS) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      void (async () => {
        await syncPayment();
        await fetchOrder();
      })();
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [waiting, polls, fetchOrder, syncPayment]);

  const stuck = view === 'awaiting' && !dismissed && polls >= MAX_POLLS;
  const canPayAgain = view === 'awaiting' && (dismissed || stuck);

  /** Re-open the gateway checkout for this unpaid order. */
  async function payAgain() {
    setPaying(true);
    setPayError(null);
    try {
      const cfg = await authFetch<{
        provider: string;
        amount: number;
        alreadyPaid: boolean;
        clientConfig: RazorpayClientConfig;
      }>(`/payments/${orderId}/config`, { method: 'POST' });
      if (cfg.alreadyPaid) {
        await fetchOrder();
        setPaying(false);
        return;
      }
      await openRazorpayCheckout(cfg.clientConfig, {
        amount: cfg.amount,
        description: `Belzo order ${orderId.slice(0, 8)}`,
        onSuccess: async (r) => {
          try {
            await authFetch(`/payments/verify`, { method: 'POST', body: verifyBody(orderId, r) });
          } catch {
            /* the poll below re-checks with the gateway */
          }
          setPolls(0);
          await fetchOrder();
          setPaying(false);
          router.replace(`/order-result?orderId=${orderId}&provider=razorpay`);
        },
        onDismiss: () => setPaying(false),
      });
    } catch (e) {
      setPayError(e instanceof Error && e.message ? e.message : 'Could not start the payment. Please try again.');
      setPaying(false);
    }
  }

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

        {view === 'awaiting' && !dismissed && !stuck && (
          <>
            <div className="orr__spin" aria-hidden />
            <h1 className="orr__title">Confirming your payment…</h1>
            <p className="orr__sub">
              We&apos;re checking with the payment gateway. This usually takes a few seconds — please don&apos;t
              close this page.
            </p>
          </>
        )}

        {view === 'awaiting' && dismissed && (
          <>
            <div className="orr__ic orr__ic--wait">⏳</div>
            <h1 className="orr__title">Payment not completed</h1>
            <p className="orr__sub">
              Your order is saved{order ? <> ({formatInr(order.grandTotal)})</> : null} but not paid yet. Complete the
              payment to confirm it. Unpaid orders are cancelled automatically after about 30 minutes.
            </p>
          </>
        )}

        {stuck && (
          <>
            <div className="orr__ic orr__ic--wait">⏳</div>
            <h1 className="orr__title">Payment is still processing</h1>
            <p className="orr__sub">
              If money was debited, your order will confirm automatically once the gateway confirms it. You can
              check its status anytime in your orders, or try paying again if the payment did not go through.
            </p>
          </>
        )}

        {view === 'failed' && (
          <>
            <div className="orr__ic orr__ic--err">✕</div>
            <h1 className="orr__title">Payment not completed</h1>
            <p className="orr__sub">
              This order was cancelled and no money was kept. You can try again from your cart.
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

        {payError && (
          <p className="orr__sub" role="alert" style={{ color: '#b91c1c' }}>
            {payError}
          </p>
        )}

        <div className="orr__actions">
          {canPayAgain && (
            <button
              type="button"
              className="orr__btn orr__btn--primary"
              onClick={() => void payAgain()}
              disabled={paying}
              data-testid="pay-again"
            >
              {paying ? 'Opening payment…' : 'Pay now'}
            </button>
          )}
          {orderId && view !== 'notfound' && (
            <Link href={`/orders/${orderId}`} className={`orr__btn${canPayAgain ? '' : ' orr__btn--primary'}`}>
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
