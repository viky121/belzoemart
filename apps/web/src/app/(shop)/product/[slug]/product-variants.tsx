'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { effectiveOrderLimits, orderLimitsHint, type ActiveOfferView, type VariantDto } from '@belzo/shared';
import { formatInr } from '@/lib/catalogue-api';
import { cartApi } from '@/lib/cart-api';
import { flyToCart } from '@/lib/fly-to-cart';
import { useAuth } from '@/lib/auth-context';
import { QtyStepper } from '@/components/qty-stepper';
import { buildSlabs, slabIndexForQty } from '@/lib/slab-pricing';
import { fetchActiveOffers } from '@/lib/offers-api';
import { limitsWithOffer, offerForVariant, productOfferBanner } from '@/lib/spend-offers';


/**
 * Price header + variant selector + quantity-slab pricing + add-to-cart.
 * The headline price (MRP / selling / % off) follows the SELECTED variant, so
 * choosing a size shows that size's admin-set price instead of the product's
 * lowest price. `children` (delivery check, trust badges) render between the
 * price header and the buy box to keep the page layout unchanged.
 */
export function ProductVariants({
  variants,
  taxRatePct,
  children,
}: {
  variants: VariantDto[];
  taxRatePct?: number;
  children?: ReactNode;
}) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? '');
  // Start at the variant's minimum order quantity (1 when the admin set none).
  const [qty, setQty] = useState(variants[0]?.minQty ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  // Special-price offers that are on now. While one is on, the pack is limited to its units per order.
  const [offers, setOffers] = useState<ActiveOfferView[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchActiveOffers().then((list) => {
      if (alive) setOffers(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  const offer = offerForVariant(offers, selected?.id);
  const limits = limitsWithOffer(effectiveOrderLimits({ minOrderQty: selected?.minQty, maxOrderQty: selected?.maxQty }), offer);
  const limitsHint = orderLimitsHint(limits);
  const fit = (n: number) => Math.min(limits.max, Math.max(limits.min, n));

  /** Switching pack size also resets the quantity to that pack's own minimum. */
  function selectVariant(v: VariantDto) {
    setSelectedId(v.id);
    setQty(v.minQty ?? 1);
    setError(null);
  }

  const slabs = useMemo(
    () => (selected ? buildSlabs(selected.mrp, selected.sellingPrice, selected.priceSlabs ?? []) : []),
    [selected],
  );
  const activeSlab = slabIndexForQty(slabs, qty);
  const bestSlab = slabs[slabs.length - 1];

  if (!selected) {
    return (
      <>
        {children}
        <p data-testid="pdp-no-variants">Currently unavailable.</p>
      </>
    );
  }

  // The headline price is what ONE unit costs at the chosen quantity: the active slab's price when the
  // admin set tiers, else the flat selling price. The cart charges the same tier prices.
  const unitPrice = slabs.length > 0 ? slabs[activeSlab].price : selected.sellingPrice;
  const off = selected.mrp > unitPrice && selected.mrp > 0 ? Math.round(((selected.mrp - unitPrice) / selected.mrp) * 100) : 0;
  const variantLabel = (v: VariantDto) => Object.values(v.attributes).join(' / ') || v.sku;

  async function addToCart(then: 'cart' | 'checkout') {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await cartApi.add(selected.id, qty, accessToken ?? undefined);
      router.push(then === 'checkout' ? '/checkout' : '/cart');
    } catch (e) {
      // Show the server's reason (e.g. "You can buy at most 5 of ... per order") instead of a generic alert.
      setError(e instanceof Error && e.message ? e.message : 'Could not add to cart. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  /** The sticky phone bar: add the item and stay on the page (the picture flies into the Cart tab and the message offers View cart). */
  async function addAndStay() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cartApi.add(selected.id, qty, accessToken ?? undefined);
      flyToCart(document.querySelector('.pdp__hero-img'), document.querySelector<HTMLImageElement>('.pdp__hero-img')?.currentSrc ?? null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not add to cart. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
    <div className="pdp-price" data-testid="pdp-price">
      {off > 0 && <span className="pdp-price__off">↓{off}%</span>}
      {off > 0 && <span className="pdp-price__mrp">{formatInr(selected.mrp)}</span>}
      <span className="pdp-price__now" data-testid="pdp-price-now">{formatInr(unitPrice)}</span>
    </div>
    {taxRatePct !== undefined && (
      <p className="pdp__tax">Inclusive of all taxes (GST {taxRatePct}%)</p>
    )}

    {children}

    <div className="buybox" data-testid="pdp-variants">
      {bestSlab && slabs.length > 1 && (
        <div className="buybox__best" data-testid="pdp-best-price">
          Best Price: <strong>{formatInr(bestSlab.price)}</strong> · Min Units: {bestSlab.min}
        </div>
      )}

      {variants.length > 1 && (
        <div className="buybox__packs">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => selectVariant(v)}
              className={`pack-chip${v.id === selectedId ? ' pack-chip--active' : ''}`}
              data-testid={`variant-${v.sku}`}
            >
              {variantLabel(v)} · {formatInr(v.sellingPrice)}
            </button>
          ))}
        </div>
      )}

      {/* Quantity → price / margin slab table: only for variants the admin gave bulk-price tiers */}
      {slabs.length > 1 && (
      <div className="slab-scroll">
        <table className="slab-table" data-testid="pdp-slab-table">
          <tbody>
            <tr>
              <th>Quantity</th>
              {slabs.map((s, i) => (
                <td
                  key={s.label}
                  className={`slab-cell${i === activeSlab ? ' slab--on' : ''}`}
                  onClick={() => setQty(fit(s.min))}
                  role="button"
                  tabIndex={0}
                  title={`Set quantity to ${s.min}`}
                  data-testid={`slab-col-${i}`}
                >
                  {s.label}
                </td>
              ))}
            </tr>
            <tr>
              <th>Price in ₹</th>
              {slabs.map((s, i) => (
                <td
                  key={s.label}
                  className={`slab-cell${i === activeSlab ? ' slab--on' : ''}`}
                  onClick={() => setQty(fit(s.min))}
                >
                  {formatInr(s.price)}
                </td>
              ))}
            </tr>
            <tr className="slab-table__margin">
              <th>Margin in %</th>
              {slabs.map((s, i) => (
                <td
                  key={s.label}
                  className={`slab-cell${i === activeSlab ? ' slab--on' : ''}`}
                  onClick={() => setQty(fit(s.min))}
                >
                  {s.marginPct.toFixed(2)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {offer && (
        <div className="pdp-offer" data-testid="pdp-offer">
          <strong>🎁 {productOfferBanner(offer).headline}</strong>
          <span>{productOfferBanner(offer).note}</span>
        </div>
      )}
      <p className={`pdp__stock${selected.inStock ? '' : ' pdp__stock--out'}`} data-testid="pdp-stock">
        {selected.inStock ? '● In stock' : '● Out of stock'}
      </p>

      <div className="buybox__row">
        <QtyStepper
          className="qty-stepper"
          rootTestId="pdp-qty"
          testId="pdp-qty-value"
          value={qty}
          min={limits.min}
          max={limits.max}
          onCommit={setQty}
          onLiveChange={setQty}
        />

        <div className="buybox__actions">
          <button
            className="btn-cart"
            disabled={!selected.inStock || busy}
            data-testid="pdp-add-to-cart"
            onClick={() => addToCart('cart')}
          >
            🛒 {busy ? 'Adding…' : 'Add to cart'}
          </button>
          <button
            className="btn-buy"
            disabled={!selected.inStock || busy}
            data-testid="pdp-buy-now"
            onClick={() => addToCart('checkout')}
          >
            ⚡ Buy now
          </button>
        </div>
      </div>
      {limitsHint && (
        <p className="pdp__limits" data-testid="pdp-order-limits">
          {limitsHint}
        </p>
      )}
      {error && (
        <p className="prod-form__msg prod-form__msg--err" role="alert" data-testid="pdp-cart-error">
          {error}
        </p>
      )}
    </div>
    {/* Phones only (CSS): price, Add to cart and Buy now stay in reach above the bottom bar while the page scrolls. */}
    <div className="stickybuy" data-testid="pdp-sticky-bar">
      <div className="stickybuy__price">
        <strong>{formatInr(unitPrice)}</strong>
        {off > 0 && <s>{formatInr(selected.mrp)}</s>}
      </div>
      <button className="stickybuy__add" disabled={!selected.inStock || busy} onClick={() => void addAndStay()} data-testid="pdp-sticky-add">
        {selected.inStock ? (busy ? 'Adding…' : '🛒 Add to cart') : 'Out of stock'}
      </button>
      <button className="stickybuy__buy" disabled={!selected.inStock || busy} onClick={() => addToCart('checkout')} data-testid="pdp-sticky-buy">
        Buy now
      </button>
    </div>
    </>
  );
}
