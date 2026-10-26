'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PriceBreakup } from '@belzo/shared';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import { formatInr } from '@/lib/catalogue-api';
import { breakupView, snapshotFromBreakup } from '@/lib/price-breakup';
import { cartApi, type CartLine } from '@/lib/cart-api';
import { placeholderImage, isUsableImageUrl } from '@/lib/category-theme';
import { safeUuid } from '@/lib/uuid';
import { checkPin, pinRefusal, pinVerdict, type PinVerdict } from '@/lib/pin-check';
import { safeSession } from '@/lib/safe-storage';
import { openRazorpayCheckout, verifyBody, type RazorpayClientConfig } from '@/lib/razorpay';

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
  /** False when the shop has switched Cash on Delivery off (admin Settings). */
  codEnabled?: boolean;
  /** Delivery charge waived by a free_shipping coupon (paise); display-only. */
  shippingWaived?: number;
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
  const { accessToken, authFetch, customer } = useAuth();
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

  // Pre-fill the new-address form with the name + mobile the customer gave at
  // login/profile (only into empty fields, so typed values are never replaced).
  const profileName =
    customer?.name && customer.name.trim() !== 'Belzo Customer' ? customer.name.trim() : '';
  const profilePhone = (customer?.phone ?? '').replace(/\D/g, '').slice(-10);
  useEffect(() => {
    setForm((f) => ({
      ...f,
      fullName: f.fullName || profileName,
      phone: f.phone || profilePhone,
    }));
  }, [profileName, profilePhone, showForm]);
  const [addrError, setAddrError] = useState<string | null>(null);
  // Is the PIN typed in the new-address form one we deliver to? Checked as soon as 6 digits are typed.
  const [pinInfo, setPinInfo] = useState<{ pin: string; verdict: PinVerdict | 'checking' } | null>(null);
  useEffect(() => {
    const pin = form.pincode.trim();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setPinInfo(null);
      return;
    }
    let active = true;
    setPinInfo({ pin, verdict: 'checking' });
    void checkPin(pin).then((r) => {
      if (active) setPinInfo({ pin, verdict: pinVerdict(r) });
    });
    return () => {
      active = false;
    };
  }, [form.pincode]);

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
      setCoupon(safeSession.get('belzo_coupon') ?? '');
    }
  }, [accessToken, loadAddresses, router]);

  const runPreview = useCallback(async () => {
    if (!addressId) return;
    setError(null);
    try {
      const res = await authFetch<PreviewResult>('/checkout/preview', {
        method: 'POST',
        // The payment method decides the COD fee, so the total shown is the total charged.
        body: { addressId, couponCode: coupon || undefined, paymentMethod: method },
      });
      setPreview(res);
    } catch (e) {
      // The server says why (out of stock, quantity outside the min/max, empty cart ...).
      setError(e instanceof Error && e.message ? e.message : 'Could not compute totals. Is your cart empty?');
    }
  }, [addressId, coupon, authFetch, method]);

  // Totals of the previously chosen address must never stay on screen (or keep "Place order" enabled)
  // while the new address is being checked.
  useEffect(() => {
    setPreview(null);
  }, [addressId]);
  useEffect(() => {
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, method]);

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
      // Ask the shop's delivery list first, so a PIN we do not deliver to is refused here, on the form.
      if (pinVerdict(await checkPin(form.pincode.trim())) === 'bad') {
        setAddrError(pinRefusal(form.pincode.trim()));
        return;
      }
      const created = await authFetch<Address>('/me/addresses', {
        method: 'POST',
        body: { ...form, line2: form.line2 || undefined },
      });
      setForm({ ...EMPTY_FORM, fullName: profileName, phone: profilePhone });
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
      safeSession.remove('belzo_coupon');

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
          onSuccess: async (r) => {
            // Ask the server to verify the signature and confirm with Razorpay right away,
            // so the order doesn't depend on the webhook arriving. A failure here is fine:
            // the result page keeps syncing.
            try {
              await authFetch(`/payments/verify`, { method: 'POST', body: verifyBody(result.orderId, r) });
            } catch {
              /* the result page re-checks with the gateway */
            }
            router.push(`/order-result?orderId=${result.orderId}&provider=razorpay`);
          },
          // The order already exists (stock is held for it), so send the customer to a page
          // where they can finish paying, instead of letting them place a duplicate.
          onDismiss: () =>
            router.push(`/order-result?orderId=${result.orderId}&provider=razorpay&dismissed=1`),
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

  // If the shop switched COD off while it was chosen, move to online payment instead of failing at "Place order".
  useEffect(() => {
    if (preview?.codEnabled === false && method === 'cod') setMethod('upi');
  }, [preview?.codEnabled, method]);
  const notServiceable = preview?.serviceable === false;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const b = preview?.breakup;
  const totalMrp = items.reduce((s, i) => s + i.mrp * i.quantity, 0);
  const productDiscount = b ? Math.max(0, totalMrp - b.subtotal) : 0;
  // MRP savings + coupon discount + delivery waived by a free_shipping coupon
  // (display-only; COD fee is never a saving).
  const totalSaved = b ? productDiscount + b.discount + Math.max(0, preview?.shippingWaived ?? 0) : 0;
  const view = b ? breakupView(snapshotFromBreakup(b)) : null;
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

            {notServiceable && !showForm && (
              <p className="co-notserviceable" role="alert" data-testid="checkout-address-not-serviceable">
                🚫 We don&apos;t deliver to the PIN code of this address yet. Please choose another address or add a new
                one with a PIN code we deliver to.
              </p>
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
                    <input className="auth-input" value={form.pincode} onChange={set('pincode')} placeholder="560001" inputMode="numeric" maxLength={6} data-testid="addr-pincode" />
                    {pinInfo?.verdict === 'checking' && <p className="co-pin">Checking delivery…</p>}
                    {pinInfo?.verdict === 'ok' && <p className="co-pin co-pin--ok" data-testid="addr-pin-ok">✓ We deliver to {pinInfo.pin}</p>}
                    {pinInfo?.verdict === 'bad' && (
                      <p className="co-pin co-pin--bad" role="alert" data-testid="addr-pin-bad">
                        ✗ {pinRefusal(pinInfo.pin)}
                      </p>
                    )}
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
                  <button className="auth-btn" onClick={saveAddress} disabled={savingAddr || pinInfo?.verdict === 'bad'} data-testid="addr-save">
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
              {preview?.codEnabled !== false && (
              <label className={`co-pay__opt${method === 'cod' ? ' co-pay__opt--active' : ''}`}>
                <input type="radio" checked={method === 'cod'} onChange={() => setMethod('cod')} data-testid="pay-cod" />
                <span>💵 Cash on Delivery<em>Pay with cash at the time of delivery</em></span>
              </label>
              )}
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
                      {i.offerId && <em className="cox__offer">🎁 Offer price</em>}
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
                {/* Subtotal − Coupon + Delivery + COD fee = Total (prices include GST). */}
                {view!.rows.map((r) => (
                  <div key={r.key} className={r.key === 'discount' ? 'co-row co-row--save' : 'co-row'}>
                    <span>{r.label}</span>
                    <span>
                      {r.key === 'discount'
                        ? `−${formatInr(-r.amount)}`
                        : r.key === 'shipping' && r.amount === 0
                          ? 'FREE'
                          : formatInr(r.amount)}
                    </span>
                  </div>
                ))}
                {totalSaved > 0 && (
                  <div className="cox__saved">🎉 You save {formatInr(totalSaved)} on this order!</div>
                )}
                <div className="co-row co-row--total" data-testid="checkout-grand-total">
                  <span>Total Amount</span><span>{formatInr(b.grandTotal)}</span>
                </div>
                {view!.gstNote && (
                  <div className="co-row co-row--note" data-testid="checkout-gst-included">
                    <span>{view!.gstNote.label}</span><span>{formatInr(view!.gstNote.amount)}</span>
                  </div>
                )}
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
