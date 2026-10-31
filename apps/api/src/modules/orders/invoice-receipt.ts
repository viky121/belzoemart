import QRCode from 'qrcode';
import { DEFAULT_TERMS, escapeHtml, isUpiPayLink, upiIdOf, type InvoiceDocument } from './invoice-document';

/**
 * The customer's bill as a narrow (80 mm) shop receipt: logo and store details on top, "TAX INVOICE", the
 * items (HSN, description, rate, quantity, value, with the GST rates above each line), the totals, payment
 * details, a GST breakup table, a QR code and the terms and thank-you lines at the bottom.
 *
 * `buildReceipt()` turns the invoice data (see invoice-document.ts) into a list of plain rows. The HTML
 * invoice and the PDF are both drawn from those rows, so they always say exactly the same thing.
 */

export type Align = 'left' | 'right' | 'center';

export type ReceiptRow =
  | { t: 'logo'; src: string }
  | { t: 'title'; text: string; size: 'xl' | 'lg' }
  | { t: 'center'; text: string; bold?: boolean; small?: boolean }
  | { t: 'text'; text: string; bold?: boolean; small?: boolean }
  | { t: 'rule'; style: 'dash' | 'solid' }
  | { t: 'space' }
  | { t: 'kv'; left: string; right: string; bold?: boolean; big?: boolean }
  | { t: 'cols'; cells: { text: string; w: number; align: Align }[]; bold?: boolean; small?: boolean }
  | { t: 'box'; text: string }
  | { t: 'qr'; data: string; caption?: string };

/** The wording the shop owner approved: FSSAI declaration for food sellers (verify with your advisor). */
export const FOOD_DECLARATION =
  'I/We hereby certify that food products mentioned in this invoice are warranted to be of the nature and quality which these products purport to be.';

/** Integer paise -> "1,234.50" (Indian digit grouping, no currency sign). */
export function amt(paise: number): string {
  const neg = paise < 0;
  const body = (Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? '-' : ''}${body}`;
}
const rs = (paise: number) => `Rs. ${amt(paise)}`;
/** 2.5 -> "2.5", 18 -> "18". */
const rate = (n: number) => String(Number(n.toFixed(2)));

/** "9876543210" -> "98XXXXXX10": enough to recognise, not enough to copy. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length < 6) return null;
  return `${digits.slice(0, 2)}${'X'.repeat(digits.length - 4)}${digits.slice(-2)}`;
}

const lines = (v: string | null | undefined): string[] =>
  (v ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function buildReceipt(doc: InvoiceDocument): ReceiptRow[] {
  const s = doc.seller;
  const rows: ReceiptRow[] = [];
  const t = doc.totals;
  const intra = doc.showIntra;

  // ---- Store ----
  if (s.logoUrl) rows.push({ t: 'logo', src: s.logoUrl });
  rows.push({ t: 'title', text: (s.legalName || s.name).toUpperCase(), size: 'xl' });
  if (s.name && s.name !== s.legalName && s.name.toUpperCase() !== s.legalName.toUpperCase()) {
    rows.push({ t: 'center', text: `(${s.name})`, small: true });
  }
  for (const l of lines(s.address)) rows.push({ t: 'center', text: l });
  const place = [s.city, s.state, s.pincode].filter(Boolean).join(', ');
  if (place) rows.push({ t: 'center', text: place });
  if (s.phone) rows.push({ t: 'center', text: `Customer Care: ${s.phone}` });
  if (s.email) rows.push({ t: 'center', text: s.email });
  if (s.website) rows.push({ t: 'center', text: s.website });
  rows.push({ t: 'center', text: s.gstin ? `GSTIN: ${s.gstin}${s.stateCode ? `  (State code ${s.stateCode})` : ''}` : 'GSTIN: Not registered', bold: true });
  if (s.pan) rows.push({ t: 'center', text: `PAN: ${s.pan}`, small: true });
  if (s.fssai) rows.push({ t: 'center', text: `FSSAI Lic No: ${s.fssai}`, bold: true });
  rows.push({ t: 'rule', style: 'dash' });

  // ---- Savings message ----
  if (doc.savings > 0) {
    rows.push({ t: 'box', text: `You have saved ${rs(doc.savings)}` });
    rows.push({ t: 'rule', style: 'dash' });
  }

  // ---- Invoice header ----
  rows.push({ t: 'title', text: 'TAX INVOICE', size: 'lg' });
  rows.push({ t: 'center', text: '*** Original for Recipient ***', small: true });
  rows.push({ t: 'rule', style: 'dash' });
  rows.push({ t: 'kv', left: 'Invoice No', right: doc.number });
  rows.push({ t: 'kv', left: 'Date', right: doc.invoiceDateTime });
  rows.push({ t: 'kv', left: 'Order No', right: `#${doc.orderNo}` });
  if (doc.orderDateTime !== doc.invoiceDateTime) rows.push({ t: 'kv', left: 'Order Date', right: doc.orderDateTime });
  const customer = doc.billTo.name ?? doc.shipTo.name;
  if (customer) rows.push({ t: 'kv', left: 'Customer', right: customer });
  const mobile = maskPhone(doc.billTo.phone ?? doc.shipTo.phone);
  if (mobile) rows.push({ t: 'kv', left: 'Mobile', right: mobile });
  const ship = doc.shipTo;
  const shipAddress = [ship.line1, ship.line2, [ship.city, ship.pincode].filter(Boolean).join(' - ') || null]
    .filter((x): x is string => Boolean(x))
    .join(', ');
  if (shipAddress) rows.push({ t: 'text', text: `Deliver to: ${shipAddress}`, small: true });
  rows.push({ t: 'kv', left: 'Place of Supply', right: doc.placeOfSupply });
  rows.push({ t: 'rule', style: 'dash' });

  // ---- Items ----
  const itemCols = (cells: [string, string, string, string, string], bold = false): ReceiptRow => ({
    t: 'cols',
    bold,
    cells: [
      { text: cells[0], w: 0.16, align: 'left' },
      { text: cells[1], w: 0.34, align: 'left' },
      { text: cells[2], w: 0.17, align: 'right' },
      { text: cells[3], w: 0.11, align: 'right' },
      { text: cells[4], w: 0.22, align: 'right' },
    ],
  });
  rows.push(itemCols(['HSN', 'Item', 'Rate', 'Qty', 'Value'], true));
  rows.push({ t: 'rule', style: 'solid' });
  for (const l of doc.lines) {
    const taxLine = intra
      ? `${l.sr}) CGST @ ${rate(l.cgstRate)}%  SGST @ ${rate(l.sgstRate)}%`
      : `${l.sr}) IGST @ ${rate(l.igstRate)}%`;
    rows.push({ t: 'text', text: taxLine, small: true });
    rows.push(itemCols([l.hsn || '-', l.title, amt(l.unitPrice), String(l.quantity), amt(l.gross)]));
    if (l.mrp > l.unitPrice) {
      rows.push({ t: 'text', text: `   MRP ${amt(l.mrp)}  |  You save ${amt((l.mrp - l.unitPrice) * l.quantity)}`, small: true });
    }
    if (l.discount > 0) rows.push({ t: 'text', text: `   Coupon share: -${amt(l.discount)}`, small: true });
  }
  rows.push({ t: 'rule', style: 'solid' });
  rows.push({
    t: 'cols',
    bold: true,
    cells: [
      { text: `Items: ${doc.itemCount}`, w: 0.5, align: 'left' },
      { text: `Qty: ${doc.lineSums.quantity}`, w: 0.2, align: 'right' },
      { text: amt(doc.lineSums.gross), w: 0.3, align: 'right' },
    ],
  });

  // ---- Totals ----
  rows.push({ t: 'rule', style: 'dash' });
  if (doc.mrpTotal > t.itemTotal) {
    rows.push({ t: 'kv', left: 'Gross Sales Value (MRP)', right: amt(doc.mrpTotal) });
    rows.push({ t: 'kv', left: 'Product Discount', right: `-${amt(doc.productDiscount)}` });
  }
  if (t.discount > 0 || t.couponCode) {
    rows.push({ t: 'kv', left: `Coupon Discount${t.couponCode ? ` (${t.couponCode})` : ''}`, right: `-${amt(t.discount)}` });
  }
  rows.push({ t: 'kv', left: t.pricesIncludeGst ? 'Net Sales Value (incl. GST)' : 'Net Sales Value', right: amt(t.netTotal) });
  if (!t.pricesIncludeGst) {
    rows.push({ t: 'kv', left: 'GST', right: amt(t.cgst + t.sgst + t.igst) });
  }
  rows.push({ t: 'kv', left: 'Delivery Charges', right: t.shipping > 0 ? amt(t.shipping) : 'FREE' });
  if (t.codFee > 0) rows.push({ t: 'kv', left: 'COD Fee', right: amt(t.codFee) });
  if (t.roundOff !== 0) rows.push({ t: 'kv', left: 'Round Off', right: `${t.roundOff < 0 ? '-' : ''}${amt(Math.abs(t.roundOff))}` });
  rows.push({ t: 'rule', style: 'solid' });
  rows.push({ t: 'kv', left: 'TOTAL AMOUNT', right: rs(t.grandTotal), bold: true, big: true });
  rows.push({ t: 'text', text: t.amountInWords, small: true });
  rows.push({ t: 'rule', style: 'dash' });

  // ---- Payment ----
  rows.push({ t: 'kv', left: 'Payment Mode', right: doc.paymentMethod });
  rows.push({ t: 'kv', left: 'Payment Status', right: doc.paymentStatus });
  rows.push({ t: 'kv', left: 'Amount Paid', right: rs(doc.amountPaid) });
  if (doc.balanceDue > 0) {
    rows.push({ t: 'kv', left: doc.isCod ? 'To Pay on Delivery' : 'Balance Due', right: rs(doc.balanceDue), bold: true });
  }
  if (doc.paymentRef) rows.push({ t: 'kv', left: 'Payment Ref No', right: doc.paymentRef });
  rows.push({ t: 'rule', style: 'dash' });

  // ---- GST breakup (by rate) ----
  rows.push({ t: 'center', text: '--- GST Breakup Details --- Amount (INR)', bold: true, small: true });
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of doc.lines) {
    const g = byRate.get(l.taxRatePct) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable += l.taxable;
    g.cgst += l.cgst;
    g.sgst += l.sgst;
    g.igst += l.igst;
    byRate.set(l.taxRatePct, g);
  }
  const gstCols = (cells: string[], bold = false): ReceiptRow => {
    const widths = intra ? [0.14, 0.26, 0.2, 0.2, 0.2] : [0.18, 0.32, 0.25, 0.25];
    return { t: 'cols', bold, small: true, cells: cells.map((text, i) => ({ text, w: widths[i]!, align: i === 0 ? 'left' : 'right' })) };
  };
  rows.push(gstCols(intra ? ['GST%', 'Taxable', 'CGST', 'SGST', 'Total'] : ['GST%', 'Taxable', 'IGST', 'Total'], true));
  rows.push({ t: 'rule', style: 'solid' });
  let tTaxable = 0;
  let tCgst = 0;
  let tSgst = 0;
  let tIgst = 0;
  for (const [r, g] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    tTaxable += g.taxable;
    tCgst += g.cgst;
    tSgst += g.sgst;
    tIgst += g.igst;
    const total = g.taxable + g.cgst + g.sgst + g.igst;
    rows.push(gstCols(intra ? [rate(r), amt(g.taxable), amt(g.cgst), amt(g.sgst), amt(total)] : [rate(r), amt(g.taxable), amt(g.igst), amt(total)]));
  }
  rows.push({ t: 'rule', style: 'solid' });
  rows.push(
    gstCols(
      intra
        ? ['Total', amt(tTaxable), amt(tCgst), amt(tSgst), amt(tTaxable + tCgst + tSgst)]
        : ['Total', amt(tTaxable), amt(tIgst), amt(tTaxable + tIgst)],
      true,
    ),
  );
  rows.push({ t: 'center', text: '(Amount inclusive of applicable taxes)', small: true });
  rows.push({ t: 'rule', style: 'dash' });

  // ---- References + QR ----
  rows.push({ t: 'kv', left: 'Tax Invoice No', right: doc.number });
  rows.push({ t: 'text', text: `Order ID: ${doc.orderId}`, small: true });
  // Cash on Delivery with money still to pay: the shop's UPI payment QR code instead of the order QR code.
  const payLink = doc.isCod && doc.balanceDue > 0 && s.codPaymentQr && isUpiPayLink(s.codPaymentQr) ? s.codPaymentQr : null;
  if (payLink) {
    rows.push({ t: 'qr', data: payLink, caption: `Scan to pay Rs. ${amt(doc.balanceDue)} by UPI` });
    const upiId = upiIdOf(payLink);
    if (upiId) rows.push({ t: 'center', text: `UPI ID: ${upiId}`, small: true });
  } else if (doc.verifyUrl) {
    rows.push({ t: 'qr', data: doc.verifyUrl, caption: 'Scan to view your order' });
  }
  rows.push({ t: 'rule', style: 'dash' });

  // ---- Terms and thanks ----
  rows.push({ t: 'center', text: 'Terms & Conditions Apply', bold: true, small: true });
  for (const l of lines(s.terms ?? DEFAULT_TERMS)) rows.push({ t: 'text', text: l, small: true });
  rows.push({ t: 'space' });
  rows.push({ t: 'center', text: `* Thank you for shopping with ${s.name} *`, bold: true });
  const contact = [s.phone ? `Care: ${s.phone}` : null, s.email].filter(Boolean).join(' | ');
  if (contact) rows.push({ t: 'center', text: contact, small: true });
  if (s.website) rows.push({ t: 'center', text: `Returns & refunds: ${s.website.replace(/\/+$/, '')}/page/returns-policy`, small: true });
  if (s.fssai) rows.push({ t: 'text', text: FOOD_DECLARATION, small: true });
  rows.push({ t: 'center', text: 'This is a computer generated invoice and does not require a signature.', small: true });
  return rows;
}

// ---------------------------------------------------------------------------
// QR code
// ---------------------------------------------------------------------------

/** The QR code as a square grid of dark (true) and light (false) modules, with no quiet zone. */
export function qrMatrix(data: string): boolean[][] {
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.modules.get(y, x) === 1));
}

/** Inline SVG of the QR code (4 modules of white border included). */
function qrSvg(data: string): string {
  const m = qrMatrix(data);
  const n = m.length;
  const q = 4;
  let d = '';
  m.forEach((row, y) => {
    let x = 0;
    while (x < n) {
      if (!row[x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < n && row[x + w]) w++;
      d += `M${x + q} ${y + q}h${w}v1h-${w}z`;
      x += w;
    }
  });
  const size = n + q * 2;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const CSS = `
* { box-sizing: border-box; }
html { background: #e5e7eb; }
body { margin: 0; padding: 12px 0 24px; font-family: "Courier New", Courier, ui-monospace, monospace; color: #000; }
.toolbar { text-align: center; margin-bottom: 10px; }
.toolbar button { font: 600 14px system-ui, sans-serif; padding: 9px 18px; border: 0; border-radius: 6px; background: #111827; color: #fff; cursor: pointer; }
.receipt { width: 80mm; max-width: 100%; margin: 0 auto; background: #fff; padding: 4mm 3.5mm 6mm; font-size: 11px; line-height: 1.35; box-shadow: 0 1px 6px rgba(0,0,0,.18); }
.logo { display: block; margin: 0 auto 3px; max-width: 46mm; max-height: 22mm; }
.c { text-align: center; overflow-wrap: anywhere; }
.xl { font-size: 15px; font-weight: 700; text-align: center; letter-spacing: .3px; overflow-wrap: anywhere; }
.lg { font-size: 15px; font-weight: 700; text-align: center; letter-spacing: 1px; margin: 1px 0; }
.b { font-weight: 700; }
.s { font-size: 10px; }
.t { overflow-wrap: anywhere; }
.rule { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
.rule.solid { border-top-style: solid; }
.kv { display: flex; justify-content: space-between; gap: 8px; }
.kv > span:first-child { flex: 0 1 45%; }
.kv > span:last-child { flex: 1 1 55%; text-align: right; overflow-wrap: anywhere; }
.kv.big { font-size: 14px; }
.cols { display: flex; gap: 3px; }
.cols > span { overflow-wrap: anywhere; min-width: 0; }
.cols .right { text-align: right; }
.cols .center { text-align: center; }
.box { border: 1px solid #000; text-align: center; font-weight: 700; padding: 3px 4px; margin: 2px 0; }
.qrwrap { text-align: center; margin: 4px 0; }
.qr { width: 34mm; height: 34mm; }
.space { height: 6px; }
@page { size: 80mm auto; margin: 0; }
@media print {
  html { background: #fff; }
  body { padding: 0; }
  .no-print { display: none !important; }
  .receipt { box-shadow: none; width: 80mm; padding: 3mm; }
}
`;

/** Accept http(s) URLs or an embedded base64 image, so a logo can never inject markup or script. */
function safeLogo(src: string): string | null {
  const v = src.trim();
  const ok =
    /^https?:\/\//i.test(v) || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(v);
  return ok ? v : null;
}

function rowHtml(r: ReceiptRow, shop: string): string {
  const cls = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');
  switch (r.t) {
    case 'logo': {
      const src = safeLogo(r.src);
      return src ? `<img class="logo" src="${escapeHtml(src)}" alt="${escapeHtml(shop)} logo">` : '';
    }
    case 'title':
      return `<div class="${r.size}">${escapeHtml(r.text)}</div>`;
    case 'center':
      return `<div class="${cls('c', r.bold && 'b', r.small && 's')}">${escapeHtml(r.text)}</div>`;
    case 'text':
      return `<div class="${cls('t', r.bold && 'b', r.small && 's')}">${escapeHtml(r.text)}</div>`;
    case 'rule':
      return `<hr class="${cls('rule', r.style === 'solid' && 'solid')}">`;
    case 'space':
      return '<div class="space"></div>';
    case 'kv':
      return `<div class="${cls('kv', r.bold && 'b', r.big && 'big')}"><span>${escapeHtml(r.left)}</span><span>${escapeHtml(r.right)}</span></div>`;
    case 'cols':
      return `<div class="${cls('cols', r.bold && 'b', r.small && 's')}">${r.cells
        .map((c) => `<span class="${c.align}" style="flex:0 0 calc(${(c.w * 100).toFixed(2)}% - 3px)">${escapeHtml(c.text)}</span>`)
        .join('')}</div>`;
    case 'box':
      return `<div class="box">${escapeHtml(r.text)}</div>`;
    case 'qr':
      return `<div class="qrwrap">${qrSvg(r.data)}${r.caption ? `<div class="c s">${escapeHtml(r.caption)}</div>` : ''}</div>`;
  }
}

/** The invoice as a self-contained 80 mm receipt page (inline CSS, no scripts besides the Print button). */
export function renderInvoiceHtml(doc: InvoiceDocument): string {
  const shop = doc.seller.name;
  const body = buildReceipt(doc)
    .map((r) => rowHtml(r, shop))
    .filter(Boolean)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax Invoice ${escapeHtml(doc.number)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="toolbar no-print"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
<main class="receipt">
${body}
</main>
</body>
</html>
`;
}
