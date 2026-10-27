'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cartApi, type CartView } from '@/lib/cart-api';
import { useAuth } from '@/lib/auth-context';
import { QtyStepper } from '@/components/qty-stepper';
import { CartOffers } from '@/components/cart-offers';
import { formatInr } from '@/lib/catalogue-api';
import { placeholderImage, isUsableImageUrl } from '@/lib/category-theme';
import { safeSession } from '@/lib/safe-storage';
import { effectiveOrderLimits, orderLimitsHint } from '@belzo/shared';

/** Cart page (FR-4.2): line cards, quantity, remove, summary, coupon, checkout. */
export default function CartPage() {
  const { accessToken } = useAuth();
  const [cart, setCart] = useState<CartView | null>(null);
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const view = await cartApi.get(accessToken ?? undefined).catch(() => null);
    setCart(view);
  }, [accessToken]);

  useEffect(() => {
    void load();
    if (typeof window !== 'undefined') {
      setCoupon(safeSession.get('belzo_coupon') ?? '');
    }
  }, [load]);

  async function update(variantId: string, quantity: number) {
    setBusy(true);
    setNotice(null);
    try {
      setCart(await cartApi.update(variantId, quantity, accessToken ?? undefined));
    } catch (e) {
      // e.g. "You can buy at most 5 of ... per order": show it and put the real quantity back.
      setNotice(e instanceof Error && e.message ? e.message : 'Could not update the quantity.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addOffer(variantId: string) {
    setBusy(true);
    setNotice(null);
    try {
      setCart(await cartApi.add(variantId, 1, accessToken ?? undefined));
    } catch (e) {
      setNotice(e instanceof Error && e.message ? e.message : 'Could not add the offer item.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(variantId: string) {
    setBusy(true);
    try {
      setCart(await cartApi.remove(variantId, accessToken ?? undefined));
    } finally {
      setBusy(false);
    }
  }

  function applyCoupon() {
    const code = coupon.trim().toUpperCase();
    setCoupon(code);
    if (typeof window !== 'undefined') {
      if (code) safeSession.set('belzo_coupon', code);
      else safeSession.remove('belzo_coupon');
    }
    setCouponMsg(code ? `“${code}” will be applied at checkout.` : null);
  }

  const active = cart?.items.filter((i) => !i.savedForLater) ?? [];
  const subtotal = active.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const savings = active.reduce((s, i) => s + Math.max(0, i.mrp - i.unitPrice) * i.quantity, 0);
  const count = active.reduce((s, i) => s + i.quantity, 0);

  function tierHint(item: (typeof active)[number]): { applied?: string; next?: string } | null {
    const slabs = [...(item.priceSlabs ?? [])].sort((a, b) => a.minQty - b.minQty);
    if (slabs.length === 0 || item.offerId) return null;
    const applied =
      item.unitPrice < item.basePrice
        ? `Bulk price applied — buying ${item.tierQty} of this product`
        : undefined;
    const next = slabs.find((s) => s.minQty > item.tierQty);
    const nextMsg = next
      ? `Add ${next.minQty - item.tierQty} more to pay ${formatInr(next.unitPrice)}/unit`
      : undefined;
    if (!applied && !nextMsg) return null;
    return { applied, next: nextMsg };
  }

  return (
    <section className="cartx" data-testid="cart-page">
      <div className="cartx__head">
        <div>
          <h1>🛒 Your Cart</h1>
          <p>Review your items and proceed to checkout</p>
        </div>
        <Link href="/" className="cartx__continue">
          ← Continue Shopping
        </Link>
      </div>

      {active.length === 0 ? (
        <p className="cartx__empty" data-testid="cart-empty">
          Your cart is empty. <Link href="/">Continue shopping</Link>
        </p>
      ) : (
        <div className="cartx__grid">
          <div className="cartx__main">
            {notice && (
              <p className="prod-form__msg prod-form__msg--err" role="alert" data-testid="cart-notice">
                {notice}
              </p>
            )}
            <CartOffers offers={cart?.offers} busy={busy} onAdd={(id) => void addOffer(id)} />
            <ul className="cartx__items" data-testid="cart-items">
              {active.map((item) => {
                const real = isUsableImageUrl(item.imageUrl);
                const hint = tierHint(item);
                const limits = effectiveOrderLimits({ minOrderQty: item.minQty, maxOrderQty: item.maxQty });
                const limitsHint = orderLimitsHint(limits);
                const outOfRange = item.quantity < limits.min || item.quantity > limits.max;
                return (
                  <li key={item.id} className="cline" data-testid={`cart-line-${item.sku}`}>
                    <div className="cline__img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={real ? item.imageUrl! : placeholderImage(item.title, item.sku)}
                        alt={item.title}
                      />
                    </div>

                    <div className="cline__info">
                      <span className="cline__title">{item.title}</span>
                      {item.unit && <span className="cline__unit">{item.unit}</span>}
                      <span className={`cline__stock${item.inStock ? '' : ' cline__stock--out'}`}>
                        {item.inStock ? '● In Stock' : '● Out of stock'}
                      </span>
                      <div className="cline__pricem">
                        <span className="cline__price">{formatInr(item.unitPrice)}</span>
                        {item.offerId && (
                          <span className="cline__offer" data-testid={`cart-offer-tag-${item.sku}`}>
                            🎁 Offer price{item.regularUnitPrice ? ` (was ${formatInr(item.regularUnitPrice)})` : ''}
                          </span>
                        )}
                        {item.discountPct > 0 && (
                          <>
                            <span className="cline__mrp">{formatInr(item.mrp)}</span>
                            <span className="cline__off">{item.discountPct}% OFF</span>
                          </>
                        )}
                      </div>
                      {limitsHint && (
                        <div className="cline__hint" data-testid={`cart-limits-${item.sku}`}>
                          <span className={outOfRange ? 'cline__stock--out' : 'cline__hint-next'}>
                            {outOfRange
                              ? `Quantity must be between ${limits.min} and ${limits.max} to check out.`
                              : limitsHint}
                          </span>
                        </div>
                      )}
                      {hint && (
                        <div className="cline__hint" data-testid={`cart-tier-${item.sku}`}>
                          {hint.applied && <span className="cline__hint-on">✓ {hint.applied}</span>}
                          {hint.next && <span className="cline__hint-next">🎁 {hint.next}</span>}
                        </div>
                      )}
                    </div>

                    <div className="cline__actions">
                      <QtyStepper
                        className="cline__qty"
                        testId={`cart-qty-${item.sku}`}
                        value={item.quantity}
                        min={limits.min}
                        max={limits.max}
                        disabled={busy}
                        onCommit={(n) => update(item.variantId, Math.min(limits.max, Math.max(limits.min, n)))}
                      />
                      <span className="cline__linetotal">
                        {formatInr(item.unitPrice * item.quantity)}
                      </span>
                      <button
                        className="cline__remove"
                        onClick={() => remove(item.variantId)}
                        disabled={busy}
                        data-testid={`cart-remove-${item.sku}`}
                        aria-label="Remove item"
                      >
                        🗑
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="cartx__coupon">
              <span className="cartx__coupon-ic">🏷️</span>
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="Have a coupon code? Enter it here"
                data-testid="cart-coupon"
              />
              <button onClick={applyCoupon} data-testid="cart-apply-coupon">
                Apply
              </button>
            </div>
            {couponMsg && <p className="cartx__coupon-msg">{couponMsg}</p>}
          </div>

          <aside className="cartx__side">
            <div className="cartx__summary">
              <h2>Order Summary</h2>
              <div className="cartx__row">
                <span>Subtotal ({count} items)</span>
                <span data-testid="cart-subtotal">{formatInr(subtotal)}</span>
              </div>
              {savings > 0 && (
                <div className="cartx__row cartx__row--save">
                  <span>You save</span>
                  <span>−{formatInr(savings)}</span>
                </div>
              )}
              <div className="cartx__row">
                <span>Delivery Charges</span>
                <span className="cartx__muted">At checkout</span>
              </div>
              <div className="cartx__row cartx__row--total">
                <span>Total Amount</span>
                <span>{formatInr(subtotal)}</span>
              </div>
              <Link href="/checkout" className="cartx__checkout" data-testid="cart-checkout">
                🔒 Proceed to Checkout →
              </Link>
              <Link href="/" className="cartx__ghost">
                ← Continue Shopping
              </Link>
              <div className="cartx__safe">
                🛡️ <span>Safe &amp; Secure Checkout — your information is safe with us.</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="cartx__trust">
        <div><span>🚚</span><strong>Fast &amp; Reliable Delivery</strong><em>On time, every time</em></div>
        <div><span>🛡️</span><strong>100% Genuine Products</strong><em>Authentic &amp; trusted</em></div>
        <div><span>₹</span><strong>Best Prices</strong><em>Great deals every day</em></div>
        <div><span>🎧</span><strong>Dedicated Support</strong><em>We&apos;re here to help</em></div>
      </div>
    </section>
  );
}
