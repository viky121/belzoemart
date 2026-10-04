'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PriceBreakup } from '@belzo/shared';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import { formatInr } from '@/lib/catalogue-api';
import { cartApi, type CartLine } from '@/lib/cart-api';
import { placeholderImage, isUsableImageUrl } from '@/lib/category-theme';
import { safeUuid } from '@/lib/uuid';
import { openRazorpayCheckout, type RazorpayClientConfig } from '@/lib/razorpay';

interface Address {
  id: string;
  label: string;
  fullName?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

interface PreviewResult {
  breakup: PriceBreakup;
  coupon: { code: string; valid: boolean; reason?: string } | null;
  serviceable?: boolean;
}

const EMPTY_FORM = {
  label: 'home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
};

/** Checkout (FR-4.4-4.9): 3-step flow — address, payment, review + place. */
export default function CheckoutPage() {
  const router = useRouter();
  const { accessToken, authFetch } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [items, setItems] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState('');
  const [method, setMethod] = useState<'upi' | 'cod'>('upi');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savingAddr, setSavingAddr] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    const a = await authFetch<Address[]>('/me/addresses').catch(() => [] as Address[]);
    setAddresses(a);
    if (a[0]) setAddressId((cur) => cur || a[0].id);
    setShowForm(a.length === 0);
    return a;
  }, [authFetch]);

  useEffect(() => {
    if (!accessToken) {
      router.push(loginHref('/checkout'));
      return;
    }
    void loadAddresses();
    void cartApi
      .get(accessToken)
      .then((c) => setItems(c.items.filter((i) => !i.savedForLater)))
      .catch(() => setItems([]));
    if (typeof window !== 'undefined') {
      setCoupon(window.sessionStorage.getItem('belzo_coupon') ?? '');
    }
  }, [accessToken, loadAddresses, router]);

  const runPreview = useCallback(async () => {
    if (!addressId) return;
    setError(null);
    try {
      const res = await authFetch<PreviewResult>('/checkout/preview', {
        method: 'POST',
        body: { addressId, couponCode: coupon || undefined },
      });
      setPreview(res);
    } catch {
      setError('Could not compute totals. Is your cart empty?');
    }
  }, [addressId, coupon, authFetch]);

  useEffect(() => {
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId]);

  async function saveAddress() {
    setAddrError(null);
    if (!form.fullName || !form.phone || !form.line1 || !form.city || !form.state || !form.pincode) {
      setAddrError('Please fill name, phone, address, city, state and PIN code.');
      return;
    }
    if (!/^(\+91)?[6-9]\d{9}$/.test(form.phone)) {
      setAddrError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!/^[1-9]\d{5}$/.test(form.pincode)) {
      setAddrError('Enter a valid 6-digit PIN code.');
      return;
    }
    setSavingAddr(true);
    try {
      const created = await authFetch<Address>('/me/addresses', {
        method: 'POST',
        body: { ...form, line2: form.line2 || undefined },
      });
      setForm(EMPTY_FORM);
      const list = await loadAddresses();
      setAddressId(created?.id ?? list[list.length - 1]?.id ?? '');
      setShowForm(false);
    } catch {
      setAddrError('Could not save address. Check the details and try again.');
    } finally {
      setSavingAddr(false);
    }
  }

  async function placeOrder() {
    setBusy(true);
    setError(null);
    try {
      const key = safeUuid();
      const result = await authFetch<{
        orderId: string;
        payment: { provider: string; amount?: number; clientConfig?: RazorpayClientConfig };
      }>(`/checkout/place?idempotencyKey=${key}`, {
        method: 'POST',
        body: { addressId, paymentMethod: method, couponCode: coupon || undefined },
      });
      if (typeof window !== 'undefined') window.sessionStorage.removeItem('belzo_coupon');

      const cfg = result.payment.clientConfig;
      // Live Razorpay → open the hosted checkout widget. Capture is confirmed
      // server-side via webhook; the success handler only forwards the user to
      // the result page, which polls until the order is confirmed.
      if (method !== 'cod' && cfg?.provider === 'razorpay') {
        const addr = addresses.find((a) => a.id === addressId);
        const amount = Number(cfg.amount ?? preview?.breakup.grandTotal ?? 0);
        await openRazorpayCheckout(cfg, {
          amount,
          description: `Belzo order ${result.orderId.slice(0, 8)}`,
          prefill: { name: addr?.fullName, contact: addr?.phone },
          onSuccess: () =>
            router.push(`/order-result?orderId=${result.orderId}&provider=razorpay`),
          onDismiss: () => {
            setBusy(false);
            setError('Payment was cancelled. Your order is awaiting payment — you can retry from your orders.');
          },
        });
        return; // keep the button busy while the widget is open
      }

      // COD or mock/dev provider → go straight to the result page.
      router.push(`/order-result?orderId=${result.orderId}&provider=${result.payment.provider}`);
    } catch (e) {
      // Surface the server's reason (e.g. non-serviceable PIN) when available.
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'Could not place the order. Please review your cart and try again.',
      );
      setBusy(false);
    }
  }

  const notServiceable = preview?.serviceable === false;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const b = preview?.breakup;
  const totalMrp = items.reduce((s, i) => s + i.mrp * i.quantity, 0);
  const productDiscount = b ? Math.max(0, totalMrp - b.subtotal) : 0;
  const totalSaved = b ? Math.max(0, totalMrp - b.grandTotal) : 0;
  const step = addressId ? 3 : 1;

  return (
    <div className="cox" data-testid="checkout-page">
      <Link href="/cart" className="cox__back">
        ← Back to Cart
      </Link>
      <h1 className="cox__title">Checkout</h1>
      <p className="cox__sub">Complete your order in a few simple steps</p>

      <ol className="cox__steps" aria-label="Checkout steps">
        <li className={step >= 1 ? 'is-on' : ''}><span>1</span> Delivery Address</li>
        <li className={step >= 2 ? 'is-on' : ''}><span>2</span> Payment Method</li>
        <li className={step >= 3 ? 'is-on' : ''}><span>3</span> Review &amp; Place Order</li>
      </ol>

      <div className="cox__grid">
        <div className="cox__main">
          {error && (
            <p role="alert" className="auth-error" data-testid="checkout-error">
              {error}
            </p>
          )}

          {/* Delivery address */}
          <div className="cox__card">
            <div className="cox__card-head">
              <h2>Delivery Address</h2>
              {addresses.length > 0 && !showForm && (
                <button className="co-link" onClick={() => setShowForm(true)}>
                  + Add New Address
                </button>
              )}
            </div>

            {addresses.length > 0 && (
              <div className="co-addr-list">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`co-addr${a.id === addressId ? ' co-addr--active' : ''}`}
                    data-testid={`checkout-address-${a.id}`}
                  >
                    <input
                      type="radio"
                      name="addr"
                      checked={a.id === addressId}
                      onChange={() => setAddressId(a.id)}
                    />
                    <span>
                      <strong>{a.label?.toUpperCase()}</strong>
                      {a.fullName ? ` — ${a.fullName}` : ''}
                      <br />
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} - {a.pincode}
                      {a.phone ? <><br />📞 {a.phone}</> : null}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {showForm && (
              <div className="addr-form" data-testid="checkout-add-address">
                {addrError && <p className="auth-error">{addrError}</p>}
                <div className="addr-grid">
                  <div>
                    <label className="auth-label">Address type</label>
                    <select className="auth-input" value={form.label} onChange={set('label')} data-testid="addr-label">
                      <option value="home">Home</option>
                      <option value="work">Work</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="auth-label">Full name</label>
                    <input className="auth-input" value={form.fullName} onChange={set('fullName')} data-testid="addr-name" />
                  </div>
                  <div>
                    <label className="auth-label">Mobile number</label>
                    <input className="auth-input" value={form.phone} onChange={set('phone')} placeholder="9876543210" data-testid="addr-phone" />
                  </div>
                  <div>
                    <label className="auth-label">PIN code</label>
                    <input className="auth-input" value={form.pincode} onChange={set('pincode')} placeholder="560001" data-testid="addr-pincode" />
                  </div>
                  <div className="addr-grid__full">
                    <label className="auth-label">Address (house no, street, area)</label>
                    <input className="auth-input" value={form.line1} onChange={set('line1')} data-testid="addr-line1" />
                  </div>
                  <div className="addr-grid__full">
                    <label className="auth-label">Landmark / locality (optional)</label>
                    <input className="auth-input" value={form.line2} onChange={set('line2')} data-testid="addr-line2" />
                  </div>
                  <div>
                    <label className="auth-label">City</label>
                    <input className="auth-input" value={form.city} onChange={set('city')} data-testid="addr-city" />
                  </div>
                  <div>
                    <label className="auth-label">State</label>
                    <input className="auth-input" value={form.state} onChange={set('state')} data-testid="addr-state" />
                  </div>
                </div>
                <div className="addr-form__actions">
                  <button className="auth-btn" onClick={saveAddress} disabled={savingAddr} data-testid="addr-save">
                    {savingAddr ? 'Saving…' : 'Save address'}
                  </button>
                  {addresses.length > 0 && (
                    <button className="co-link" onClick={() => setShowForm(false)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="cox__card">
            <h2>Payment Method</h2>
            <div className="co-pay">
              <label className={`co-pay__opt${method === 'upi' ? ' co-pay__opt--active' : ''}`}>
                <input type="radio" checked={method === 'upi'} onChange={() => setMethod('upi')} data-testid="pay-upi" />
                <span>💳 UPI / Card / Netbanking<em>Pay securely via UPI, Debit/Credit Card or Netbanking</em></span>
              </label>
              <label className={`co-pay__opt${method === 'cod' ? ' co-pay__opt--active' : ''}`}>
                <input type="radio" checked={method === 'cod'} onChange={() => setMethod('cod')} data-testid="pay-cod" />
                <span>💵 Cash on Delivery<em>Pay with cash at the time of delivery</em></span>
              </label>
            </div>
          </div>
        </div>

        {/* Order summary */}
        <aside className="cox__side">
          <div className="cox__summary">
            <div className="cox__summary-head">
              <h2>Order Summary</h2>
              <span>{items.length} items</span>
            </div>

            <ul className="cox__items">
              {items.map((i) => {
                const real = isUsableImageUrl(i.imageUrl);
                return (
                  <li key={i.id} className="cox__item">
                    <span className="cox__item-img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={real ? i.imageUrl! : placeholderImage(i.title, i.sku)} alt={i.title} />
                    </span>
                    <span className="cox__item-info">
                      <strong>{i.title}</strong>
                      <em>{i.unit ? `${i.unit} · ` : ''}Qty {i.quantity}</em>
                    </span>
                    <span className="cox__item-price">{formatInr(i.unitPrice * i.quantity)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="co-coupon">
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="Coupon code (e.g. WELCOME10)"
                data-testid="checkout-coupon"
              />
              <button onClick={runPreview} data-testid="checkout-apply-coupon">
                Apply
              </button>
            </div>
            {preview?.coupon && !preview.coupon.valid && (
              <p className="co-coupon__msg" data-testid="checkout-coupon-msg">
                {preview.coupon.reason ?? 'Coupon not applicable'}
              </p>
            )}
            {preview?.coupon && preview.coupon.valid && (
              <p className="co-coupon__ok">✓ Coupon “{preview.coupon.code}” applied</p>
            )}

            {b ? (
              <div className="co-rows" data-testid="checkout-breakup">
                {totalMrp > 0 && (
                  <div className="co-row"><span>Total MRP ({items.length} items)</span><span>{formatInr(totalMrp)}</span></div>
                )}
                {productDiscount > 0 && (
                  <div className="co-row co-row--save"><span>Discount</span><span>−{formatInr(productDiscount)}</span></div>
                )}
                {b.discount > 0 && (
                  <div className="co-row co-row--save"><span>Coupon discount</span><span>−{formatInr(b.discount)}</span></div>
                )}
                <div className="co-row"><span>Subtotal</span><span>{formatInr(b.subtotal)}</span></div>
                <div className="co-row"><span>GST {b.gst.igst > 0 ? '(IGST)' : '(CGST+SGST)'}</span><span>{formatInr(b.tax)}</span></div>
                <div className="co-row"><span>Delivery Charges</span><span>{b.shipping === 0 ? 'FREE' : formatInr(b.shipping)}</span></div>
                {b.codFee > 0 && <div className="co-row"><span>COD fee</span><span>{formatInr(b.codFee)}</span></div>}
                {totalSaved > 0 && (
                  <div className="cox__saved">🎉 You save {formatInr(totalSaved)} on this order!</div>
                )}
                <div className="co-row co-row--total" data-testid="checkout-grand-total">
                  <span>Total Amount</span><span>{formatInr(b.grandTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="co-hint">Select a delivery address to see the total.</p>
            )}

            {notServiceable && (
              <p className="co-notserviceable" role="alert" data-testid="checkout-not-serviceable">
                🚫 We don&apos;t deliver to this PIN code yet. Please choose or add a delivery
                address in a serviceable area.
              </p>
            )}

            <button
              className="co-place"
              onClick={placeOrder}
              disabled={busy || !addressId || !b || notServiceable}
              data-testid="checkout-place-order"
            >
              {busy
                ? 'Placing…'
                : notServiceable
                  ? 'Not deliverable to this PIN'
                  : method === 'cod'
                    ? '🔒 Place Order (COD)'
                    : '🔒 Continue to Payment →'}
            </button>
            <div className="cox__secure">🛡️ Your information is 100% secure</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
