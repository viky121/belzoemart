import { gstSplitLabel, isGstInclusiveSnapshot, type PriceBreakup } from '@belzo/shared';

/**
 * Display rows for an order's price breakup (checkout summary and order
 * detail). Prices are GST-inclusive, so GST is shown as an "Includes GST" note
 * that does NOT add to the total. Legacy orders (charged GST-exclusive, GST
 * added on top) are detected from their snapshot and keep GST as an added row,
 * so the visible rows always sum to the stored grand total.
 */

/** Flat money snapshot of an order / breakup (integer paise). */
export interface OrderMoneySnapshot {
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
}

export function snapshotFromBreakup(b: PriceBreakup): OrderMoneySnapshot {
  return {
    subtotal: b.subtotal,
    discount: b.discount,
    shipping: b.shipping,
    codFee: b.codFee,
    tax: b.tax,
    cgst: b.gst.cgst,
    sgst: b.gst.sgst,
    igst: b.gst.igst,
    grandTotal: b.grandTotal,
  };
}

export interface BreakupRow {
  key: 'subtotal' | 'discount' | 'gst' | 'shipping' | 'codFee';
  label: string;
  /** Signed paise contribution to the total (discount is negative). */
  amount: number;
}

export interface BreakupView {
  /** False for a legacy GST-exclusive order. */
  inclusive: boolean;
  rows: BreakupRow[];
  /** Informational "Includes GST" line (inclusive orders with tax > 0). */
  gstNote: { label: string; amount: number } | null;
  /** Stored grand total (authoritative). */
  grandTotal: number;
}

export function breakupView(s: OrderMoneySnapshot): BreakupView {
  const inclusive = isGstInclusiveSnapshot(s);
  const split = gstSplitLabel(s);
  const rows: BreakupRow[] = [{ key: 'subtotal', label: 'Subtotal', amount: s.subtotal }];
  if (s.discount > 0) rows.push({ key: 'discount', label: 'Coupon discount', amount: -s.discount });
  if (!inclusive) rows.push({ key: 'gst', label: `GST (${split})`, amount: s.tax });
  rows.push({ key: 'shipping', label: 'Delivery Charges', amount: s.shipping });
  if (s.codFee > 0) rows.push({ key: 'codFee', label: 'COD fee', amount: s.codFee });
  return {
    inclusive,
    rows,
    gstNote: inclusive && s.tax > 0 ? { label: `Includes GST (${split})`, amount: s.tax } : null,
    grandTotal: s.grandTotal,
  };
}
