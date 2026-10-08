import { addMoney, clampNonNegative, paise, percentOf, subtractMoney, ZERO_MONEY, type Money } from './money';
import { allocateProportional } from './gst';
import type { GstSplit, PriceBreakup } from './schemas';

/**
 * Pure pricing / tax / coupon engine (BR-4..BR-9). Deterministic and free of
 * I/O so it can be exhaustively property-tested. All amounts are integer paise.
 */

export interface PriceLine {
  /** Selling price per unit, in paise. */
  unitPrice: Money;
  quantity: number;
  /** GST rate percent for this line's product (by HSN). */
  taxRatePct: number;
}

export type CouponKind = 'flat' | 'percent' | 'free_shipping';

export interface CouponSpec {
  kind: CouponKind;
  /** For flat: paise off. For percent: percentage (0..100). Ignored for free_shipping. */
  value: number;
  /** Minimum order subtotal (paise) required for the coupon to apply. */
  minOrder?: Money;
  /** Cap on the discount for percent coupons (paise). */
  maxDiscount?: Money;
}

export interface PriceComputationInput {
  lines: PriceLine[];
  /** True when buyer and seller are in the same state (CGST+SGST) vs inter-state (IGST). */
  sameState: boolean;
  shipping: Money;
  codFee: Money;
  coupon?: CouponSpec;
}

/** Subtotal = Σ (unitPrice × quantity). */
export function subtotalOf(lines: PriceLine[]): Money {
  return lines.reduce<Money>((sum, l) => {
    if (!Number.isInteger(l.quantity) || l.quantity < 0) {
      throw new RangeError('quantity must be a non-negative integer');
    }
    return addMoney(sum, paise(l.unitPrice * l.quantity));
  }, ZERO_MONEY);
}

/**
 * Split a GST amount into its components. When sameState, CGST and SGST each
 * take half of the tax (SGST absorbs any odd paise so the parts sum exactly to
 * the total); otherwise IGST takes the full tax. Guarantees
 * cgst + sgst + igst == tax (BR-6).
 */
export function splitGst(tax: Money, sameState: boolean): GstSplit {
  if (sameState) {
    const cgst = paise(Math.floor(tax / 2));
    const sgst = paise(tax - cgst);
    return { cgst, sgst, igst: ZERO_MONEY };
  }
  return { cgst: ZERO_MONEY, sgst: ZERO_MONEY, igst: tax };
}

/**
 * Legacy GST-EXCLUSIVE maths: GST added on top of a taxable amount at a rate,
 * split via splitGst. Not used by computeTotals (prices are GST-inclusive);
 * kept for compatibility and for building legacy-order fixtures in tests.
 */
export function computeGst(taxableAmount: Money, ratePct: number, sameState: boolean): GstSplit {
  return splitGst(percentOf(taxableAmount, ratePct), sameState);
}

/** Per-line GST extraction result (all integer paise, GST-inclusive). */
export interface InclusiveLineTax {
  /** unitPrice × quantity. */
  gross: Money;
  /** This line's pro-rata share of the order discount. */
  discount: Money;
  /** gross − discount: the GST-inclusive amount actually charged for the line. */
  net: Money;
  /** GST contained in `net` at the line's rate. */
  tax: Money;
}

/**
 * GST-inclusive per-line tax extraction. The order discount is allocated
 * across lines pro-rata by line value (floor shares, remainder to the last
 * line with value, so shares sum exactly to `discount`); each line's GST is
 * then extracted from its net: round(net × rate / (100 + rate)). A 0% line
 * contributes 0. `discount` must not exceed Σ gross (couponDiscount ensures it).
 */
export function inclusiveLineTaxes(lines: PriceLine[], discount: Money): InclusiveLineTax[] {
  const gross = lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity < 0) {
      throw new RangeError('quantity must be a non-negative integer');
    }
    return l.unitPrice * l.quantity;
  });
  const shares = lines.length === 0 || discount === 0 ? gross.map(() => 0) : allocateProportional(discount, gross, gross);
  return lines.map((l, i) => {
    const net = gross[i]! - shares[i]!;
    // Integer paise × integer rate / integer denominator: IEEE division is
    // correctly rounded, so Math.round sees the exact x.5 ties (no drift).
    const tax = l.taxRatePct > 0 ? Math.round((net * l.taxRatePct) / (100 + l.taxRatePct)) : 0;
    return { gross: paise(gross[i]!), discount: paise(shares[i]!), net: paise(net), tax: paise(tax) };
  });
}

/**
 * Discount for a coupon against a subtotal (BR-8). Returns 0 if the coupon does
 * not meet minOrder. Never exceeds the subtotal. free_shipping yields 0 here
 * (shipping is zeroed separately in computeTotals).
 */
export function couponDiscount(coupon: CouponSpec | undefined, subtotal: Money): Money {
  if (!coupon) return ZERO_MONEY;
  if (coupon.minOrder && subtotal < coupon.minOrder) return ZERO_MONEY;
  if (coupon.kind === 'free_shipping') return ZERO_MONEY;

  let discount: Money;
  if (coupon.kind === 'flat') {
    discount = paise(Math.max(0, Math.round(coupon.value)));
  } else {
    // percent
    const pct = percentOf(subtotal, coupon.value);
    discount = coupon.maxDiscount != null ? paise(Math.min(pct, coupon.maxDiscount)) : pct;
  }
  // Never exceed subtotal.
  return paise(Math.min(discount, subtotal));
}

/**
 * Compute the full price breakup (BR-4..BR-7). Prices are GST-INCLUSIVE: the
 * customer pays (subtotal − discount) + shipping + codFee, and GST is
 * extracted per line from (line value − pro-rata discount share) at each
 * line's own rate (no blended-rate rounding). `tax`/`gst` report the GST
 * contained in the price; taxable value = subtotal − discount − tax.
 */
export function computeTotals(input: PriceComputationInput): PriceBreakup {
  const subtotal = subtotalOf(input.lines);
  const discount = couponDiscount(input.coupon, subtotal);
  const net = clampNonNegative(subtractMoney(subtotal, discount));

  const tax = addMoney(...inclusiveLineTaxes(input.lines, discount).map((l) => l.tax));
  const gst = splitGst(tax, input.sameState);

  const shipping =
    input.coupon?.kind === 'free_shipping' && (!input.coupon.minOrder || subtotal >= input.coupon.minOrder)
      ? ZERO_MONEY
      : input.shipping;

  // Tax is already inside `net` — NOT added on top.
  const grandTotal = addMoney(net, shipping, input.codFee);

  return {
    subtotal,
    discount,
    shipping,
    codFee: input.codFee,
    tax,
    gst,
    grandTotal: clampNonNegative(grandTotal),
  };
}

/**
 * Line-value-weighted average tax rate (percent), rounded to nearest integer.
 * Legacy GST-exclusive maths, not used by computeTotals; kept for
 * compatibility and for building legacy-order fixtures in tests.
 */
export function weightedTaxRate(lines: PriceLine[]): number {
  const totalValue = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  if (totalValue === 0) return 0;
  const weighted = lines.reduce((s, l) => s + l.taxRatePct * (l.unitPrice * l.quantity), 0);
  return Math.round(weighted / totalValue);
}

/** Money fields of a stored order snapshot needed to tell the pricing mode. */
export interface TaxSnapshot {
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  tax: number;
  grandTotal: number;
}

/**
 * True when an order snapshot was priced GST-inclusive (GST contained in the
 * total), false for a legacy GST-exclusive order where GST was added on top,
 * i.e. tax > 0 and grandTotal == subtotal − discount + tax + shipping + codFee.
 * With tax 0 both modes coincide; that is reported as inclusive.
 */
export function isGstInclusiveSnapshot(s: TaxSnapshot): boolean {
  const legacyExclusive = s.tax > 0 && s.grandTotal === s.subtotal - s.discount + s.tax + s.shipping + s.codFee;
  return !legacyExclusive;
}

/** Display label for a GST split: IGST when inter-state, else CGST+SGST. */
export function gstSplitLabel(g: { igst: number }): 'IGST' | 'CGST+SGST' {
  return g.igst > 0 ? 'IGST' : 'CGST+SGST';
}
