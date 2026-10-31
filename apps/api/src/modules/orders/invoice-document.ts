import {
  allocateProportional,
  amountInWordsInr,
  gstStateCode,
  isGstInclusiveSnapshot,
} from '@belzo/shared';

/**
 * Pure GST tax-invoice builder + HTML template (no Nest, no I/O).
 *
 * `buildInvoiceDocument()` turns the stored order snapshot into plain invoice
 * data; the receipt layout (invoice-receipt.ts) turns that into the 80 mm bill. The order's stored money fields (integer paise) are the
 * source of truth: per-line discount, taxable value and CGST/SGST/IGST are
 * allocations of the stored totals that sum EXACTLY to them, and the grand
 * total printed is the stored grand total (any gap shows as an explicit
 * round-off row). Works for both GST-exclusive and GST-inclusive snapshots:
 * taxable = grandTotal - shipping - codFee - tax, and the mode (shared
 * isGstInclusiveSnapshot) only picks how the stored tax is shared across lines
 * (inclusive: each line's extracted GST, net x r / (100 + r), as checkout did;
 * legacy exclusive: net x rate). Nothing here recomputes order totals.
 */

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML-escape any value (`& < > " '`). null/undefined become ''. */
export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** Trimmed non-empty string, else null. */
function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceSeller {
  /** Store / trade name. */
  name: string;
  /** Legal business name (falls back to the trade name). */
  legalName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  /** FSSAI licence number (food sellers). */
  fssai: string | null;
  terms: string | null;
  /**
   * UPI payment link (upi://pay?...) printed as a QR code on Cash on Delivery invoices, in place of the
   * "view your order" QR code. Empty or missing: the order QR code is printed as for every other order.
   */
  codPaymentQr?: string | null;
}

/**
 * The shop's SBI UPI QR code (the one on the counter stand), read from the photo of the stand.
 * Used on Cash on Delivery invoices unless the admin sets `store.codPaymentQr`.
 */
export const DEFAULT_COD_PAYMENT_QR =
  'upi://pay?pa=SBIBHIM.INSTANT97993723982907045@sbipay&tn=StaticQR&mode=01&orgid=180080&purpose=00';

/** A UPI payment link we accept for the COD QR code: upi://pay?..., short enough for a small receipt QR. */
export function isUpiPayLink(v: string): boolean {
  return /^upi:\/\/pay\?[^\s]{5,400}$/i.test(v);
}

/** The UPI ID (pa=) inside a payment link, or null. */
export function upiIdOf(link: string): string | null {
  const q = link.split('?')[1] ?? '';
  return new URLSearchParams(q).get('pa');
}

export interface InvoiceParty {
  name: string | null;
  phone: string | null;
  email: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
}

export interface InvoiceOrderItem {
  variantId: string;
  title: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  taxRatePct: number;
  /** Set when the item was sold through a special-price offer: a coupon never discounted it. */
  offerId?: string | null;
  offerName?: string | null;
  /** Printed MRP of one unit when the order was placed (paise). */
  mrp?: number | null;
}

export interface InvoicePayment {
  provider: string;
  status: string;
  method?: string | null;
  /** The gateway's payment id (shown as the payment reference). */
  providerPaymentId?: string | null;
  createdAt: Date;
}

export interface InvoiceOrder {
  id: string;
  createdAt: Date;
  couponCode?: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  items: InvoiceOrderItem[];
  payments?: InvoicePayment[];
}

export interface InvoiceAddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface InvoiceCustomerInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface InvoiceLine {
  /** Printed MRP of one unit, never below the selling price. */
  mrp: number;
  sr: number;
  title: string;
  sku: string;
  hsn: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  discount: number;
  taxable: number;
  taxRatePct: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface InvoiceHsnRow {
  hsn: string;
  taxRatePct: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export interface InvoiceDocument {
  /** "25/10/2026 09:15 AM" (India time). */
  invoiceDateTime: string;
  orderDateTime: string;
  /** Different products on the bill. */
  itemCount: number;
  /** Gross sales value: every unit at its printed MRP. */
  mrpTotal: number;
  /** MRP minus the selling price, over all units. */
  productDiscount: number;
  /** What the customer saved in all: product discount plus coupon discount. */
  savings: number;
  /** Cash on Delivery order. */
  isCod: boolean;
  /** The payment went through (status Paid). */
  paymentSettled: boolean;
  /** Gateway payment id, when there is one. */
  paymentRef: string | null;
  amountPaid: number;
  /** Still to pay (Cash on Delivery, or an unfinished online payment). */
  balanceDue: number;
  /** Where the invoice QR code points: the order page. */
  verifyUrl: string | null;
  number: string;
  invoiceDate: string;
  orderNo: string;
  orderId: string;
  orderDate: string;
  paymentMethod: string;
  paymentStatus: string;
  placeOfSupply: string;
  reverseCharge: 'No';
  seller: InvoiceSeller;
  billTo: InvoiceParty;
  shipTo: InvoiceParty;
  /** Show CGST + SGST columns (intra-state). */
  showIntra: boolean;
  /** Show IGST columns (inter-state). */
  showInter: boolean;
  lines: InvoiceLine[];
  lineSums: {
    quantity: number;
    gross: number;
    discount: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  hsn: InvoiceHsnRow[];
  hsnTotals: { taxable: number; cgst: number; sgst: number; igst: number; totalTax: number };
  totals: {
    itemTotal: number;
    discount: number;
    couponCode: string | null;
    /** Item total after discount (gross - discount). */
    netTotal: number;
    /** True when the stored snapshot shows tax was extracted from the price (GST-inclusive). */
    pricesIncludeGst: boolean;
    /** Σ line taxable = grandTotal - shipping - codFee - tax. */
    taxableTotal: number;
    cgst: number;
    sgst: number;
    igst: number;
    shipping: number;
    codFee: number;
    roundOff: number;
    grandTotal: number;
    amountInWords: string;
  };
}

export interface BuildInvoiceInput {
  /** variantId -> today's MRP, used only for items whose order did not save an MRP. */
  mrpByVariant?: Map<string, number>;
  /** Public website address, for the QR code link (https://belzoemart.com). */
  publicBaseUrl?: string | null;
  number: string;
  invoiceDate: Date;
  order: InvoiceOrder;
  /** variantId -> product HSN code. */
  hsnByVariant: Map<string, string>;
  address: InvoiceAddressInput | null;
  customer: InvoiceCustomerInput | null;
  seller: InvoiceSeller;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/**
 * Split known per-line tax amounts into the stored CGST/SGST/IGST heads so each
 * line keeps exactly its own tax and every column sums exactly to the stored
 * head. Intra-state: each line splits in halves (odd paisa to SGST, as checkout
 * does), then single paise move SGST -> CGST on odd lines until Σ CGST matches,
 * so a line's CGST and SGST never differ by more than 1 paisa. Returns null if
 * the stored heads can't be reproduced this way (caller falls back to pro-rata).
 */
function splitLineTaxes(
  lineTax: number[],
  cgstTotal: number,
  sgstTotal: number,
  igstTotal: number,
): { cgst: number[]; sgst: number[]; igst: number[] } | null {
  if (sum(lineTax) !== cgstTotal + sgstTotal + igstTotal) return null;
  const zeros = lineTax.map(() => 0);
  if (igstTotal > 0) {
    return cgstTotal + sgstTotal === 0 ? { cgst: zeros, sgst: [...zeros], igst: [...lineTax] } : null;
  }
  const cgst = lineTax.map((t) => Math.floor(t / 2));
  const sgst = lineTax.map((t, i) => t - cgst[i]!);
  let delta = cgstTotal - sum(cgst);
  if (delta < 0) return null;
  for (let i = 0; i < lineTax.length && delta > 0; i++) {
    if (sgst[i]! > cgst[i]!) {
      cgst[i] = cgst[i]! + 1;
      sgst[i] = sgst[i]! - 1;
      delta -= 1;
    }
  }
  return delta === 0 ? { cgst, sgst, igst: zeros } : null;
}

function paymentInfo(payments: InvoicePayment[] | undefined): {
  method: string;
  status: string;
  isCod: boolean;
  settled: boolean;
  ref: string | null;
} {
  if (!payments || payments.length === 0) return { method: '-', status: '-', isCod: false, settled: false, ref: null };
  const byLatest = [...payments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const p = byLatest.find((x) => x.status === 'captured') ?? byLatest[0]!;
  const isCod = p.provider === 'cod';
  let method: string;
  if (isCod) method = 'Cash on Delivery';
  else if (p.provider === 'razorpay') method = `Online (Razorpay${clean(p.method) ? ` \u00b7 ${clean(p.method)}` : ''})`;
  else if (p.provider === 'mock') method = 'Online (test)';
  else method = p.provider;
  const STATUS: Record<string, string> = {
    captured: 'Paid',
    created: isCod ? 'Pending \u2013 pay on delivery' : 'Pending',
    pending: isCod ? 'Pending \u2013 pay on delivery' : 'Pending',
    failed: 'Failed',
    refunded: 'Refunded',
    partially_refunded: 'Partially refunded',
  };
  return {
    method,
    status: STATUS[p.status] ?? p.status,
    isCod,
    settled: p.status === 'captured',
    ref: clean(p.providerPaymentId),
  };
}

/** "25/10/2026 09:15 AM" in India time. */
function fmtDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/** Build the invoice data from the stored order snapshot. Never throws on missing address/customer. */
export function buildInvoiceDocument(input: BuildInvoiceInput): InvoiceDocument {
  const { order, seller, address, customer } = input;
  const items = order.items;

  // Regime mirrors what was charged (D5): IGST stored => inter-state; CGST/SGST
  // stored => intra-state; zero-tax orders fall back to the same state
  // comparison checkout uses (trim + lowercase).
  const buyerState = clean(address?.state);
  const sameStateByName =
    buyerState === null || seller.state === null
      ? true
      : buyerState.toLowerCase() === seller.state.trim().toLowerCase();
  const noTax = order.cgst === 0 && order.sgst === 0 && order.igst === 0;
  const showIntra = order.cgst > 0 || order.sgst > 0 || (noTax && sameStateByName);
  const showInter = order.igst > 0 || (noTax && !sameStateByName);

  // Discount: pro-rata by gross, capped at each line's gross; sums to order.discount.
  const gross = items.map((i) => i.unitPrice * i.quantity);
  const grossSum = sum(gross);
  // Special-offer items carry no share of a coupon discount.
  const discountable = gross.map((g, idx) => (items[idx]!.offerId ? 0 : g));
  const discountableSum = sum(discountable);
  const discounts =
    items.length === 0
      ? []
      : allocateProportional(order.discount, discountable, order.discount <= discountableSum ? discountable : undefined);
  const net = gross.map((g, idx) => Math.max(0, g - discounts[idx]!));

  // Order taxable value derived from the snapshot so it is right for both
  // GST-exclusive orders (grandTotal = net + tax + shipping + codFee) and
  // GST-inclusive orders (grandTotal = net + shipping + codFee, tax extracted):
  // taxable = grandTotal - shipping - codFee - tax.
  const orderTaxable = Math.max(0, order.grandTotal - order.shipping - order.codFee - order.tax);
  const alloc = (total: number, weights: number[]) =>
    items.length === 0 ? [] : allocateProportional(total, weights);
  const netSum = sum(net);
  // Inclusive only when the shared rule the web order pages use agrees (so the
  // invoice never calls an order inclusive that the web shows as legacy) AND the
  // snapshot positively reconciles as inclusive (Σ line net = grandTotal -
  // shipping - codFee). Odd snapshots that are neither keep the mode-agnostic
  // pro-rata split below, which still reconciles exactly to the stored values.
  const pricesIncludeGst =
    order.tax > 0 && isGstInclusiveSnapshot(order) && netSum === orderTaxable + order.tax;

  // Legacy GST-exclusive weights: line net x line GST rate (plan D3), so a 0%
  // line gets no tax and each line's amount tracks its printed rate. Rates are
  // scaled to integer basis points (2.5% -> 250) because the allocator needs
  // integer weights. If every weight is 0 but tax was charged (e.g. legacy
  // snapshot with rates missing), fall back to net.
  const rateWeights = items.map((i, idx) => net[idx]! * Math.max(0, Math.round(i.taxRatePct * 100)));
  const fallbackWeights = rateWeights.some((w) => w > 0) ? rateWeights : net;
  // GST-inclusive: the GST inside a line is net x r / (100 + r), the same
  // per-line extraction checkout used (inclusiveLineTaxes), NOT proportional to
  // net x r. Use those integer line taxes directly; 0% lines are 0.
  const extractedTax = items.map((i, idx) =>
    i.taxRatePct > 0 ? Math.round((net[idx]! * i.taxRatePct) / (100 + i.taxRatePct)) : 0,
  );
  const exact = pricesIncludeGst ? splitLineTaxes(extractedTax, order.cgst, order.sgst, order.igst) : null;
  // If the stored heads don't match the per-line extraction exactly (odd
  // snapshot), still weight by the extracted taxes; remainder on the last
  // weighted line so every column sums EXACTLY to the stored order value.
  const taxWeights = pricesIncludeGst && extractedTax.some((w) => w > 0) ? extractedTax : fallbackWeights;
  const cgst = exact?.cgst ?? alloc(order.cgst, taxWeights);
  const sgst = exact?.sgst ?? alloc(order.sgst, taxWeights);
  const igst = exact?.igst ?? alloc(order.igst, taxWeights);
  // Line taxable values: pro-rata to line net, summing exactly to orderTaxable.
  let taxable = alloc(orderTaxable, net);
  if (pricesIncludeGst) {
    // Inclusive: line taxable = line net - line tax, so each line total is the
    // price as sold; Σ is still exactly orderTaxable (Σnet - tax). Falls back to
    // the pro-rata split only if rounding would make a tiny line negative.
    const extracted = net.map((n, idx) => n - cgst[idx]! - sgst[idx]! - igst[idx]!);
    if (extracted.every((v) => v >= 0)) taxable = extracted;
  }

  const lines: InvoiceLine[] = items.map((i, idx) => {
    const rate = i.taxRatePct;
    return {
      sr: idx + 1,
      title: i.offerId ? `${i.title} (offer price)` : i.title,
      sku: i.sku,
      hsn: clean(input.hsnByVariant.get(i.variantId)) ?? '-',
      quantity: i.quantity,
      mrp: Math.max(i.mrp ?? input.mrpByVariant?.get(i.variantId) ?? 0, i.unitPrice),
      unitPrice: i.unitPrice,
      gross: gross[idx]!,
      discount: discounts[idx]!,
      taxable: taxable[idx]!,
      taxRatePct: rate,
      cgstRate: showIntra ? rate / 2 : 0,
      sgstRate: showIntra ? rate / 2 : 0,
      igstRate: showInter ? rate : 0,
      cgst: cgst[idx]!,
      sgst: sgst[idx]!,
      igst: igst[idx]!,
      total: taxable[idx]! + cgst[idx]! + sgst[idx]! + igst[idx]!,
    };
  });

  const lineSums = {
    quantity: sum(lines.map((l) => l.quantity)),
    gross: grossSum,
    discount: sum(discounts),
    taxable: sum(taxable),
    cgst: sum(cgst),
    sgst: sum(sgst),
    igst: sum(igst),
    total: sum(lines.map((l) => l.total)),
  };

  // HSN/SAC summary grouped by HSN + rate, first-seen order.
  const groups = new Map<string, InvoiceHsnRow>();
  for (const l of lines) {
    const key = `${l.hsn}|${l.taxRatePct}`;
    const g =
      groups.get(key) ??
      ({ hsn: l.hsn, taxRatePct: l.taxRatePct, taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 } as InvoiceHsnRow);
    g.taxable += l.taxable;
    g.cgst += l.cgst;
    g.sgst += l.sgst;
    g.igst += l.igst;
    g.totalTax += l.cgst + l.sgst + l.igst;
    groups.set(key, g);
  }
  const hsn = [...groups.values()];
  const hsnTotals = {
    taxable: sum(hsn.map((h) => h.taxable)),
    cgst: sum(hsn.map((h) => h.cgst)),
    sgst: sum(hsn.map((h) => h.sgst)),
    igst: sum(hsn.map((h) => h.igst)),
    totalTax: sum(hsn.map((h) => h.totalTax)),
  };

  const computed = lineSums.taxable + order.cgst + order.sgst + order.igst + order.shipping + order.codFee;

  const buyerCode = gstStateCode(buyerState);
  const addressParty = (): Omit<InvoiceParty, 'name' | 'phone' | 'email'> => ({
    line1: clean(address?.line1),
    line2: clean(address?.line2),
    city: clean(address?.city),
    state: buyerState,
    stateCode: buyerCode,
    pincode: clean(address?.pincode),
  });
  const billTo: InvoiceParty = {
    name: clean(customer?.name) ?? clean(address?.fullName),
    phone: clean(customer?.phone) ?? clean(address?.phone),
    email: clean(customer?.email),
    ...addressParty(),
  };
  const shipTo: InvoiceParty = {
    name: clean(address?.fullName),
    phone: clean(address?.phone),
    email: null,
    ...addressParty(),
  };

  const pay = paymentInfo(order.payments);
  const mrpTotal = sum(lines.map((l) => l.mrp * l.quantity));
  const productDiscount = Math.max(0, mrpTotal - grossSum);
  const amountPaid = pay.settled ? order.grandTotal : 0;
  const base = clean(input.publicBaseUrl)?.replace(/\/+$/, '') ?? null;

  return {
    number: input.number,
    invoiceDate: DATE_FMT.format(input.invoiceDate),
    invoiceDateTime: fmtDateTime(input.invoiceDate),
    orderDateTime: fmtDateTime(order.createdAt),
    itemCount: items.length,
    mrpTotal,
    productDiscount,
    savings: productDiscount + order.discount,
    isCod: pay.isCod,
    paymentSettled: pay.settled,
    paymentRef: pay.ref,
    amountPaid,
    balanceDue: Math.max(0, order.grandTotal - amountPaid),
    verifyUrl: base ? `${base}/orders/${order.id}` : null,
    orderNo: order.id.slice(0, 8).toUpperCase(),
    orderId: order.id,
    orderDate: DATE_FMT.format(order.createdAt),
    paymentMethod: pay.method,
    paymentStatus: pay.status,
    placeOfSupply: buyerState ? `${buyerState}${buyerCode ? ` (${buyerCode})` : ''}` : '-',
    reverseCharge: 'No',
    seller,
    billTo,
    shipTo,
    showIntra,
    showInter,
    lines,
    lineSums,
    hsn,
    hsnTotals,
    totals: {
      itemTotal: grossSum,
      discount: order.discount,
      couponCode: clean(order.couponCode),
      netTotal: netSum,
      pricesIncludeGst,
      taxableTotal: lineSums.taxable,
      cgst: order.cgst,
      sgst: order.sgst,
      igst: order.igst,
      shipping: order.shipping,
      codFee: order.codFee,
      roundOff: order.grandTotal - computed,
      grandTotal: order.grandTotal,
      amountInWords: amountInWordsInr(order.grandTotal),
    },
  };
}

/** Shown on the invoice when the store has not set its own terms. */
export const DEFAULT_TERMS =
  "Goods once sold are subject to the store's return policy. Returns are accepted only for eligible items within the return window shown on the product page.";
