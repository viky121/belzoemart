'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { VariantDto } from '@belzo/shared';
import { formatInr } from '@/lib/catalogue-api';
import { cartApi } from '@/lib/cart-api';
import { useAuth } from '@/lib/auth-context';

/** Fallback ladder used only when a variant has no admin-authored slabs. */
const DERIVED_SLABS: { label: string; min: number; step: number }[] = [
  { label: '1-1', min: 1, step: 0 },
  { label: '2-3', min: 2, step: 1 },
  { label: '4-5', min: 4, step: 2 },
  { label: '6-11', min: 6, step: 3 },
  { label: '12+', min: 12, step: 4 },
];

interface Slab {
  label: string;
  min: number;
  price: number; // paise, per unit at this slab
  marginPct: number;
}

const marginPct = (mrp: number, price: number) => (mrp > 0 ? ((mrp - price) / mrp) * 100 : 0);

/** Build the display slab table. Uses admin-authored `priceSlabs` when present
 *  (slab 1 = base price, then each tier), otherwise a derived +1%/tier ladder. */
function buildSlabs(
  mrp: number,
  sellingPrice: number,
  real: { minQty: number; unitPrice: number }[],
): Slab[] {
  if (real && real.length > 0) {
    const tiers = [{ min: 1, price: sellingPrice }, ...real.map((s) => ({ min: s.minQty, price: s.unitPrice }))].sort(
      (a, b) => a.min - b.min,
    );
    return tiers.map((t, i) => {
      const next = tiers[i + 1];
      const label = next ? `${t.min}-${next.min - 1}` : `${t.min}+`;
      return { label, min: t.min, price: t.price, marginPct: marginPct(mrp, t.price) };
    });
  }
  const safeMrp = mrp > 0 ? mrp : sellingPrice;
  const baseMargin = safeMrp > 0 ? (safeMrp - sellingPrice) / safeMrp : 0;
  return DERIVED_SLABS.map((s) => {
    const margin = Math.min(0.95, baseMargin + s.step * 0.01);
    const price = s.step === 0 ? sellingPrice : Math.round(safeMrp * (1 - margin));
    return { label: s.label, min: s.min, price, marginPct: margin * 100 };
  });
}

function slabIndexForQty(slabs: Slab[], qty: number): number {
  let idx = 0;
  slabs.forEach((s, i) => {
    if (qty >= s.min) idx = i;
  });
  return idx;
}

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
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

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

  const off =
    selected.mrp > selected.sellingPrice && selected.mrp > 0
      ? Math.round(((selected.mrp - selected.sellingPrice) / selected.mrp) * 100)
      : 0;
  const variantLabel = (v: VariantDto) => Object.values(v.attributes).join(' / ') || v.sku;

  async function addToCart(then: 'cart' | 'checkout') {
    if (!selected) return;
    setBusy(true);
    try {
      await cartApi.add(selected.id, qty, accessToken ?? undefined);
      router.push(then === 'checkout' ? '/checkout' : '/cart');
    } catch {
      alert('Could not add to cart. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <div className="pdp-price" data-testid="pdp-price">
      {off > 0 && <span className="pdp-price__off">↓{off}%</span>}
      {off > 0 && <span className="pdp-price__mrp">{formatInr(selected.mrp)}</span>}
      <span className="pdp-price__now">{formatInr(selected.sellingPrice)}</span>
    </div>
    {taxRatePct !== undefined && (
      <p className="pdp__tax">Inclusive of all taxes (GST {taxRatePct}%)</p>
    )}

    {children}

    <div className="buybox" data-testid="pdp-variants">
      {bestSlab && (
        <div className="buybox__best" data-testid="pdp-best-price">
          Best Price: <strong>{formatInr(bestSlab.price)}</strong> · Min Units: {bestSlab.min}
        </div>
      )}

      {variants.length > 1 && (
        <div className="buybox__packs">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedId(v.id)}
              className={`pack-chip${v.id === selectedId ? ' pack-chip--active' : ''}`}
              data-testid={`variant-${v.sku}`}
            >
              {variantLabel(v)} · {formatInr(v.sellingPrice)}
            </button>
          ))}
        </div>
      )}

      {/* Quantity → price / margin slab table */}
      <div className="slab-scroll">
        <table className="slab-table" data-testid="pdp-slab-table">
          <tbody>
            <tr>
              <th>Quantity</th>
              {slabs.map((s, i) => (
                <td
                  key={s.label}
                  className={`slab-cell${i === activeSlab ? ' slab--on' : ''}`}
                  onClick={() => setQty(s.min)}
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
                  onClick={() => setQty(s.min)}
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
                  onClick={() => setQty(s.min)}
                >
                  {s.marginPct.toFixed(2)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className={`pdp__stock${selected.inStock ? '' : ' pdp__stock--out'}`} data-testid="pdp-stock">
        {selected.inStock ? '● In stock' : '● Out of stock'}
      </p>

      <div className="buybox__row">
        <div className="qty-stepper" data-testid="pdp-qty">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            disabled={qty <= 1}
          >
            −
          </button>
          <span data-testid="pdp-qty-value">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

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
    </div>
    </>
  );
}
