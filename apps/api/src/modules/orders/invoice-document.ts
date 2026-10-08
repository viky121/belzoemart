import {
  allocateProportional,
  amountInWordsInr,
  formatMoney,
  gstStateCode,
  isGstInclusiveSnapshot,
  paise,
} from '@belzo/shared';

/**
 * Pure GST tax-invoice builder + HTML template (no Nest, no I/O).
 *
 * `buildInvoiceDocument()` turns the stored order snapshot into plain invoice
 * data; `renderInvoiceHtml()` turns that into a self-contained, print-friendly
 * A4 HTML document. The order's stored money fields (integer paise) are the
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

/** Escaped text, or '-' when the value is missing/blank. */
function text(v: unknown): string {
  if (v === null || v === undefined) return '-';
  const s = String(v).trim();
  return s.length === 0 ? '-' : escapeHtml(s);
}

/** Trimmed non-empty string, else null. */
function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

const money = (p: number) => escapeHtml(formatMoney(paise(p)));

/** Percent without trailing zeros: 18 -> "18", 2.5 -> "2.5". */
function fmtRate(n: number): string {
  return String(Number(n.toFixed(2)));
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
  terms: string | null;
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
}

export interface InvoicePayment {
  provider: string;
  status: string;
  method?: string | null;
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

function paymentInfo(payments: InvoicePayment[] | undefined): { method: string; status: string } {
  if (!payments || payments.length === 0) return { method: '-', status: '-' };
  const byLatest = [...payments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const p = byLatest.find((x) => x.status === 'captured') ?? byLatest[0]!;
  const isCod = p.provider === 'cod';
  let method: string;
  if (isCod) method = 'Cash on Delivery';
  else if (p.provider === 'razorpay') method = `Online (Razorpay${clean(p.method) ? ` · ${clean(p.method)}` : ''})`;
  else if (p.provider === 'mock') method = 'Online (test)';
  else method = p.provider;
  const STATUS: Record<string, string> = {
    captured: 'Paid',
    created: isCod ? 'Pending – pay on delivery' : 'Pending',
    pending: isCod ? 'Pending – pay on delivery' : 'Pending',
    failed: 'Failed',
    refunded: 'Refunded',
    partially_refunded: 'Partially refunded',
  };
  return { method, status: STATUS[p.status] ?? p.status };
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
  const discounts =
    items.length === 0
      ? []
      : allocateProportional(order.discount, gross, order.discount <= grossSum ? gross : undefined);
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
      title: i.title,
      sku: i.sku,
      hsn: clean(input.hsnByVariant.get(i.variantId)) ?? '-',
      quantity: i.quantity,
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

  return {
    number: input.number,
    invoiceDate: DATE_FMT.format(input.invoiceDate),
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

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

const DEFAULT_TERMS =
  "Goods once sold are subject to the store's return policy. Returns are accepted only for eligible items within the return window shown on the product page.";

const DECLARATION =
  'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';

/** Escaped multi-line text (newlines -> <br>). */
function multiline(v: string | null): string {
  if (!v) return '-';
  return v
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br>');
}

function stateLine(state: string | null, code: string | null): string {
  return `${text(state)}${code ? ` (Code ${escapeHtml(code)})` : ''}`;
}

function partyBlock(title: string, p: InvoiceParty, withEmail: boolean): string {
  const cityPin = [p.city, p.pincode].filter(Boolean).join(' - ');
  const addr = [p.line1, p.line2, cityPin || null].filter((x): x is string => Boolean(x));
  return `<div class="party">
<h3>${escapeHtml(title)}</h3>
<div class="party-name">${text(p.name)}</div>
<div>${addr.length ? addr.map(escapeHtml).join('<br>') : '-'}</div>
<div><span class="lbl">State:</span> ${stateLine(p.state, p.stateCode)}</div>
<div><span class="lbl">PIN:</span> ${text(p.pincode)}</div>
<div><span class="lbl">Phone:</span> ${text(p.phone)}</div>
${withEmail ? `<div><span class="lbl">Email:</span> ${text(p.email)}</div>` : ''}
</div>`;
}

const CSS = `
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; font-size: 11px; color: #111; background: #f3f4f6; line-height: 1.4; }
.sheet { width: 210mm; min-height: 297mm; margin: 12px auto; padding: 12mm; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.toolbar { text-align: right; width: 210mm; margin: 12px auto 0; }
.toolbar button { font: inherit; font-size: 13px; padding: 8px 16px; border: 1px solid #1f2937; background: #1f2937; color: #fff; border-radius: 4px; cursor: pointer; }
.title { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
.title h1 { font-size: 18px; letter-spacing: .08em; margin: 0; }
.title .copy { font-size: 10px; font-weight: 600; border: 1px solid #111; padding: 2px 6px; }
.seller { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.seller-name { font-size: 15px; font-weight: 700; }
.seller img { max-height: 56px; max-width: 160px; object-fit: contain; }
.lbl { color: #4b5563; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #9ca3af; padding: 4px 5px; vertical-align: top; }
th { background: #f3f4f6; font-weight: 600; text-align: center; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ctr { text-align: center; }
.meta td { width: 25%; }
.meta td.k { color: #4b5563; width: 16%; white-space: nowrap; }
.small { font-size: 9px; color: #4b5563; word-break: break-all; }
.parties { display: flex; border: 1px solid #9ca3af; border-top: 0; margin-bottom: 8px; }
.party { flex: 1; padding: 6px 8px; }
.party + .party { border-left: 1px solid #9ca3af; }
.party h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #374151; }
.party-name { font-weight: 700; }
.items { margin-bottom: 8px; }
.items td.desc { text-align: left; }
.items tfoot td { font-weight: 700; background: #f9fafb; }
.summary { display: flex; gap: 12px; margin-bottom: 8px; align-items: flex-start; }
.summary .words { flex: 1; border: 1px solid #9ca3af; padding: 6px 8px; }
.totals { width: 46%; }
.totals td:first-child { text-align: left; }
.totals tr.grand td { font-size: 13px; font-weight: 700; background: #f3f4f6; }
h2 { font-size: 12px; margin: 8px 0 4px; }
.hsn { margin-bottom: 8px; }
.hsn tfoot td { font-weight: 700; background: #f9fafb; }
.foot { display: flex; gap: 12px; border: 1px solid #9ca3af; padding: 8px; }
.foot .decl { flex: 1; }
.foot .sign { width: 40%; text-align: right; display: flex; flex-direction: column; justify-content: space-between; min-height: 70px; }
.note { margin-top: 8px; font-size: 10px; color: #374151; }
@media print {
  body { background: #fff; }
  .no-print { display: none !important; }
  .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
  th, .items tfoot td, .hsn tfoot td, .totals tr.grand td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** Render the invoice as a self-contained A4 HTML document (inline CSS only). */
export function renderInvoiceHtml(doc: InvoiceDocument): string {
  const s = doc.seller;
  const { showIntra, showInter } = doc;

  const sellerCityPin = [s.city, s.pincode].filter(Boolean).join(' - ');
  const sellerAddress = [s.address ? multiline(s.address) : null, sellerCityPin ? escapeHtml(sellerCityPin) : null]
    .filter(Boolean)
    .join('<br>');
  const logo =
    s.logoUrl && /^https?:\/\//i.test(s.logoUrl.trim())
      ? `<img src="${escapeHtml(s.logoUrl.trim())}" alt="${escapeHtml(s.name)} logo">`
      : '';
  const tradeName = s.name && s.name !== s.legalName ? `<div>Trade name: ${escapeHtml(s.name)}</div>` : '';

  // Items table
  const taxHead =
    (showIntra ? '<th>CGST %</th><th>CGST ₹</th><th>SGST %</th><th>SGST ₹</th>' : '') +
    (showInter ? '<th>IGST %</th><th>IGST ₹</th>' : '');
  const rows = doc.lines
    .map((l) => {
      const tax =
        (showIntra
          ? `<td class="num">${fmtRate(l.cgstRate)}%</td><td class="num">${money(l.cgst)}</td><td class="num">${fmtRate(l.sgstRate)}%</td><td class="num">${money(l.sgst)}</td>`
          : '') +
        (showInter ? `<td class="num">${fmtRate(l.igstRate)}%</td><td class="num">${money(l.igst)}</td>` : '');
      return `<tr>
<td class="ctr">${l.sr}</td>
<td class="desc">${text(l.title)}<div class="small">SKU: ${text(l.sku)}</div></td>
<td class="ctr">${text(l.hsn)}</td>
<td class="num">${l.quantity}</td>
<td class="num">${money(l.unitPrice)}</td>
<td class="num">${money(l.gross)}</td>
<td class="num">${money(l.discount)}</td>
<td class="num">${money(l.taxable)}</td>
<td class="num">${fmtRate(l.taxRatePct)}%</td>
${tax}
<td class="num">${money(l.total)}</td>
</tr>`;
    })
    .join('\n');
  const ls = doc.lineSums;
  const taxFoot =
    (showIntra ? `<td></td><td class="num">${money(ls.cgst)}</td><td></td><td class="num">${money(ls.sgst)}</td>` : '') +
    (showInter ? `<td></td><td class="num">${money(ls.igst)}</td>` : '');

  // Totals
  const t = doc.totals;
  const totalRows: string[] = [
    `<tr><td>Item total</td><td class="num">${money(t.itemTotal)}</td></tr>`,
  ];
  if (t.discount > 0 || t.couponCode) {
    totalRows.push(
      `<tr><td>Less: Discount${t.couponCode ? ` (Coupon: ${escapeHtml(t.couponCode)})` : ''}</td><td class="num">-${money(t.discount)}</td></tr>`,
    );
  }
  if (t.pricesIncludeGst) {
    totalRows.push(
      `<tr><td>Net item value (incl. GST)</td><td class="num">${money(t.netTotal)}</td></tr>`,
    );
  }
  totalRows.push(`<tr><td>Total taxable value</td><td class="num">${money(t.taxableTotal)}</td></tr>`);
  if (showIntra) {
    totalRows.push(`<tr><td>CGST</td><td class="num">${money(t.cgst)}</td></tr>`);
    totalRows.push(`<tr><td>SGST</td><td class="num">${money(t.sgst)}</td></tr>`);
  }
  if (showInter) totalRows.push(`<tr><td>IGST</td><td class="num">${money(t.igst)}</td></tr>`);
  totalRows.push(`<tr><td>Shipping charges</td><td class="num">${money(t.shipping)}</td></tr>`);
  if (t.codFee > 0) totalRows.push(`<tr><td>COD fee</td><td class="num">${money(t.codFee)}</td></tr>`);
  if (t.roundOff !== 0) {
    totalRows.push(
      `<tr><td>Round-off</td><td class="num">${t.roundOff < 0 ? '-' : '+'}${money(Math.abs(t.roundOff))}</td></tr>`,
    );
  }
  totalRows.push(`<tr class="grand"><td>GRAND TOTAL</td><td class="num">${money(t.grandTotal)}</td></tr>`);

  // HSN summary
  const hsnHead =
    (showIntra ? '<th>CGST ₹</th><th>SGST ₹</th>' : '') + (showInter ? '<th>IGST ₹</th>' : '');
  const hsnRows = doc.hsn
    .map(
      (h) =>
        `<tr><td class="ctr">${text(h.hsn)}</td><td class="num">${fmtRate(h.taxRatePct)}%</td><td class="num">${money(h.taxable)}</td>` +
        (showIntra ? `<td class="num">${money(h.cgst)}</td><td class="num">${money(h.sgst)}</td>` : '') +
        (showInter ? `<td class="num">${money(h.igst)}</td>` : '') +
        `<td class="num">${money(h.totalTax)}</td></tr>`,
    )
    .join('\n');
  const ht = doc.hsnTotals;
  const hsnFoot =
    `<td colspan="2">Total</td><td class="num">${money(ht.taxable)}</td>` +
    (showIntra ? `<td class="num">${money(ht.cgst)}</td><td class="num">${money(ht.sgst)}</td>` : '') +
    (showInter ? `<td class="num">${money(ht.igst)}</td>` : '') +
    `<td class="num">${money(ht.totalTax)}</td>`;

  const support = [s.email, s.phone].filter(Boolean).map(escapeHtml).join(' | ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax Invoice ${escapeHtml(doc.number)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="toolbar no-print"><button type="button" class="no-print" onclick="window.print()">Print / Save as PDF</button></div>
<main class="sheet">
<div class="title"><h1>TAX INVOICE</h1><span class="copy">ORIGINAL FOR RECIPIENT</span></div>

<section class="seller">
<div>
<div class="seller-name">${text(s.legalName)}</div>
${tradeName}
<div>${sellerAddress || '-'}</div>
<div><span class="lbl">State:</span> ${stateLine(s.state, s.stateCode)}</div>
<div><span class="lbl">GSTIN:</span> ${s.gstin ? escapeHtml(s.gstin) : 'Not registered'}</div>
${s.pan ? `<div><span class="lbl">PAN:</span> ${escapeHtml(s.pan)}</div>` : ''}
<div><span class="lbl">Phone:</span> ${text(s.phone)} &nbsp; <span class="lbl">Email:</span> ${text(s.email)}</div>
<div><span class="lbl">Website:</span> ${text(s.website)}</div>
</div>
<div>${logo}</div>
</section>

<table class="meta">
<tr><td class="k">Invoice No</td><td><strong>${text(doc.number)}</strong></td><td class="k">Invoice Date</td><td>${text(doc.invoiceDate)}</td></tr>
<tr><td class="k">Order No</td><td><strong>#${text(doc.orderNo)}</strong><div class="small">${text(doc.orderId)}</div></td><td class="k">Order Date</td><td>${text(doc.orderDate)}</td></tr>
<tr><td class="k">Payment method</td><td>${text(doc.paymentMethod)}</td><td class="k">Payment status</td><td>${text(doc.paymentStatus)}</td></tr>
<tr><td class="k">Place of Supply</td><td>${text(doc.placeOfSupply)}</td><td class="k">Reverse charge</td><td>${doc.reverseCharge}</td></tr>
</table>

<section class="parties">
${partyBlock('Bill To', doc.billTo, true)}
${partyBlock('Ship To', doc.shipTo, false)}
</section>

<table class="items">
<thead><tr><th>Sr</th><th>Description</th><th>HSN</th><th>Qty</th><th>Unit price</th><th>Gross amount</th><th>Discount</th><th>Taxable value</th><th>GST %</th>${taxHead}<th>Total</th></tr></thead>
<tbody>
${rows}
</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="num">${ls.quantity}</td><td></td><td class="num">${money(ls.gross)}</td><td class="num">${money(ls.discount)}</td><td class="num">${money(ls.taxable)}</td><td></td>${taxFoot}<td class="num">${money(ls.total)}</td></tr></tfoot>
</table>

<section class="summary">
<div class="words"><span class="lbl">Amount in words:</span><br><strong>${escapeHtml(t.amountInWords)}</strong>${t.pricesIncludeGst ? '<div class="note">Item prices are inclusive of GST; taxable value and GST shown are extracted from the price.</div>' : ''}</div>
<table class="totals">
${totalRows.join('\n')}
</table>
</section>

<h2>HSN/SAC summary</h2>
<table class="hsn">
<thead><tr><th>HSN/SAC</th><th>GST rate</th><th>Taxable value</th>${hsnHead}<th>Total tax</th></tr></thead>
<tbody>
${hsnRows}
</tbody>
<tfoot><tr>${hsnFoot}</tr></tfoot>
</table>

<section class="foot">
<div class="decl">
<strong>Declaration</strong>
<div>${DECLARATION}</div>
<div class="note">This is a computer-generated invoice and does not require a physical signature.</div>
</div>
<div class="sign">
<div>For <strong>${text(s.legalName)}</strong></div>
<div>Authorised Signatory</div>
</div>
</section>

<div class="note"><strong>Terms:</strong> ${multiline(s.terms ?? DEFAULT_TERMS)}</div>
${support ? `<div class="note">For support contact ${support}</div>` : ''}
</main>
</body>
</html>
`;
}
