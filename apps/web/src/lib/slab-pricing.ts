/** One column of the product page's quantity → price table. */
export interface Slab {
  label: string;
  /** Smallest quantity at which this price applies. */
  min: number;
  /** Price per unit in paise at this slab. */
  price: number;
  marginPct: number;
}

const marginPct = (mrp: number, price: number) => (mrp > 0 ? ((mrp - price) / mrp) * 100 : 0);

/**
 * The slab table for a variant, built ONLY from the price tiers the admin set (slab 1 = the base
 * selling price, then each tier). A variant with no tiers has flat pricing and gets no table:
 * the cart and checkout only ever charge admin-set tiers, so showing any other ladder would
 * advertise prices that are never charged.
 */
export function buildSlabs(
  mrp: number,
  sellingPrice: number,
  real: { minQty: number; unitPrice: number }[] | undefined | null,
): Slab[] {
  if (!real || real.length === 0) return [];
  const tiers = [{ min: 1, price: sellingPrice }, ...real.map((s) => ({ min: s.minQty, price: s.unitPrice }))].sort(
    (a, b) => a.min - b.min,
  );
  return tiers.map((t, i) => {
    const next = tiers[i + 1];
    const label = next ? (next.min - 1 === t.min ? `${t.min}` : `${t.min}-${next.min - 1}`) : `${t.min}+`;
    return { label, min: t.min, price: t.price, marginPct: marginPct(mrp, t.price) };
  });
}

/** Index of the slab that applies at `qty` (0 when there are none). */
export function slabIndexForQty(slabs: Slab[], qty: number): number {
  let idx = 0;
  slabs.forEach((s, i) => {
    if (qty >= s.min) idx = i;
  });
  return idx;
}
