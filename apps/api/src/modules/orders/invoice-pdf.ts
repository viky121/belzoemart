import PDFDocument from 'pdfkit';
import type { InvoiceDocument, InvoiceParty } from './invoice-document';

/**
 * GST tax invoice as a PDF (A4), rendered from the same `InvoiceDocument` data as the HTML invoice
 * so both always show identical numbers. Pure JS (pdfkit), no browser needed on the server.
 *
 * pdfkit's built-in Helvetica covers Latin text only, so the rupee sign is written as "Rs." and any
 * character outside Latin-1 (for example Devanagari in a customer's name) is replaced with "?" in the
 * PDF. The HTML invoice on the order page keeps the full text.
 */

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_W = A4_WIDTH - MARGIN * 2;
const BOTTOM = A4_HEIGHT - MARGIN;
const GREY = '#6b7280';
const LINE = '#d1d5db';
const HEAD_BG = '#f3f4f6';

/** Latin-1 safe text for the standard PDF fonts. */
export function pdfText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\u20B9/g, 'Rs.')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\r\t]+/g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Integer paise -> "Rs. 1,234.50" (Indian digit grouping). */
export function rs(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise) / 100;
  const body = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? '-' : ''}Rs. ${body}`;
}

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

function partyLines(p: InvoiceParty, withContact: boolean): string[] {
  const place = [p.city, [p.state, p.stateCode ? `(${p.stateCode})` : null].filter(Boolean).join(' '), p.pincode]
    .filter(Boolean)
    .join(', ');
  return [
    p.name,
    p.line1,
    p.line2,
    place,
    withContact && p.phone ? `Phone: ${p.phone}` : null,
    withContact && p.email ? `Email: ${p.email}` : null,
  ]
    .filter((l): l is string => !!l && l.trim().length > 0)
    .map(pdfText);
}

function logoBuffer(dataUri: string | null): Buffer | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUri ?? '');
  return m ? Buffer.from(m[2]!, 'base64') : null;
}

export function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: false,
      info: { Title: `Tax Invoice ${pdfText(doc.number)}`, Author: pdfText(doc.seller.name), Subject: `Order #${doc.orderNo}` },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    try {
      draw(pdf, doc);
      pdf.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

type Pdf = InstanceType<typeof PDFDocument>;

function text(pdf: Pdf, s: string, x: number, y: number, w: number, opts: { bold?: boolean; size?: number; color?: string; align?: 'left' | 'right' | 'center' } = {}): number {
  pdf.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 8.5).fillColor(opts.color ?? '#111827');
  pdf.text(s, x, y, { width: w, align: opts.align ?? 'left' });
  return pdf.heightOfString(s, { width: w, align: opts.align ?? 'left' });
}

function hr(pdf: Pdf, y: number, x1 = MARGIN, x2 = MARGIN + CONTENT_W, color = LINE): void {
  pdf.save().strokeColor(color).lineWidth(0.6).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

function draw(pdf: Pdf, doc: InvoiceDocument): void {
  const s = doc.seller;
  let y = MARGIN;

  // ---- Header: seller (left) and invoice title (right) ----
  const logo = logoBuffer(s.logoUrl);
  let textX = MARGIN;
  if (logo) {
    try {
      pdf.image(logo, MARGIN, y, { fit: [46, 46] });
      textX = MARGIN + 54;
    } catch {
      /* unsupported/corrupt logo: render without it */
    }
  }
  const leftW = 330 - (textX - MARGIN);
  let hy = y;
  hy += text(pdf, pdfText(s.legalName || s.name), textX, hy, leftW, { bold: true, size: 14 }) + 2;
  const addr = [s.address, [s.city, s.state, s.pincode].filter(Boolean).join(', ')].filter(Boolean).map(pdfText).join('\n');
  if (addr) hy += text(pdf, addr, textX, hy, leftW, { size: 8.5, color: '#374151' }) + 2;
  const joinParts = (parts: (string | null)[]) => parts.filter(Boolean).map(pdfText).join('   ');
  const ids = [
    joinParts([s.gstin ? `GSTIN: ${s.gstin}` : null, s.pan ? `PAN: ${s.pan}` : null, s.stateCode ? `State code: ${s.stateCode}` : null]),
    joinParts([s.phone ? `Phone: ${s.phone}` : null, s.email ? `Email: ${s.email}` : null]),
  ]
    .filter(Boolean)
    .join('\n');
  if (ids) hy += text(pdf, ids, textX, hy, leftW, { size: 8, color: GREY });

  text(pdf, 'TAX INVOICE', MARGIN + 340, y, CONTENT_W - 340, { bold: true, size: 18, align: 'right', color: '#0f766e' });
  text(pdf, 'Original for Recipient', MARGIN + 340, y + 24, CONTENT_W - 340, { size: 8, align: 'right', color: GREY });
  y = Math.max(hy, y + 50) + 8;
  hr(pdf, y);
  y += 8;

  // ---- Meta ----
  const meta: [string, string][] = [
    ['Invoice No', doc.number],
    ['Invoice Date', doc.invoiceDate],
    ['Order No', `#${doc.orderNo}`],
    ['Order Date', doc.orderDate],
    ['Payment', `${doc.paymentMethod} (${doc.paymentStatus})`],
    ['Place of Supply', doc.placeOfSupply],
  ];
  const colW = CONTENT_W / 2;
  for (let i = 0; i < meta.length; i += 2) {
    let rowH = 12;
    for (let j = 0; j < 2; j++) {
      const m = meta[i + j];
      if (!m) continue;
      const x = MARGIN + j * colW;
      text(pdf, m[0], x, y, 80, { size: 8, color: GREY });
      const h = text(pdf, pdfText(m[1]), x + 82, y, colW - 90, { bold: true, size: 8.5 });
      rowH = Math.max(rowH, h);
    }
    y += rowH + 3;
  }
  y += 4;
  hr(pdf, y);
  y += 8;

  // ---- Bill to / Ship to ----
  const blocks: [string, InvoiceParty, boolean][] = [
    ['BILL TO', doc.billTo, true],
    ['SHIP TO', doc.shipTo, true],
  ];
  let blockH = 0;
  blocks.forEach(([title, party, contact], idx) => {
    const x = MARGIN + idx * colW;
    text(pdf, title, x, y, colW - 10, { bold: true, size: 8, color: GREY });
    const body = partyLines(party, contact).join('\n') || '-';
    const h = text(pdf, body, x, y + 11, colW - 14, { size: 8.5 });
    blockH = Math.max(blockH, h + 11);
  });
  y += blockH + 8;

  // ---- Items table ----
  const intra = doc.showIntra;
  const cols = [
    { key: 'sr', label: '#', w: 20, align: 'left' as const },
    { key: 'item', label: 'Item', w: 186, align: 'left' as const },
    { key: 'hsn', label: 'HSN', w: 44, align: 'left' as const },
    { key: 'qty', label: 'Qty', w: 28, align: 'right' as const },
    { key: 'rate', label: 'Rate', w: 60, align: 'right' as const },
    { key: 'taxable', label: 'Taxable', w: 62, align: 'right' as const },
    { key: 'gst', label: intra ? 'CGST+SGST' : 'IGST', w: 58, align: 'right' as const },
    { key: 'total', label: 'Total', w: 65, align: 'right' as const },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  const scale = CONTENT_W / tableW;
  cols.forEach((c) => (c.w = c.w * scale));
  const xs: number[] = [];
  cols.reduce((x, c) => (xs.push(x), x + c.w), MARGIN);

  const header = (yy: number): number => {
    pdf.save().rect(MARGIN, yy, CONTENT_W, 16).fill(HEAD_BG).restore();
    cols.forEach((c, i) => text(pdf, c.label, xs[i]! + 2, yy + 4, c.w - 4, { bold: true, size: 8, align: c.align }));
    return yy + 16;
  };
  y = header(y);

  for (const l of doc.lines) {
    const itemLabel = pdfText(`${l.title}${l.sku ? `\nSKU: ${l.sku}` : ''}`);
    const itemH = pdf.font('Helvetica').fontSize(8.5).heightOfString(itemLabel, { width: cols[1]!.w - 4 });
    const rowH = Math.max(itemH, 11) + 6;
    if (y + rowH > BOTTOM - 170) {
      pdf.addPage();
      y = header(MARGIN);
    }
    const tax = l.cgst + l.sgst + l.igst;
    const taxRate = l.taxRatePct;
    const cells: Record<string, string> = {
      sr: String(l.sr),
      item: itemLabel,
      hsn: pdfText(l.hsn || '-'),
      qty: String(l.quantity),
      rate: rs(l.unitPrice),
      taxable: rs(l.taxable),
      gst: `${rs(tax)}\n(${pct(taxRate)})`,
      total: rs(l.total),
    };
    cols.forEach((c, i) => text(pdf, cells[c.key]!, xs[i]! + 2, y + 3, c.w - 4, { size: c.key === 'gst' ? 8 : 8.5, align: c.align }));
    y += Math.max(rowH, gstCellHeight(pdf, cells.gst!, cols[6]!.w));
    hr(pdf, y);
  }
  y += 8;

  // ---- Totals (right) ----
  const t = doc.totals;
  const rows: [string, string, boolean?][] = [
    ['Item total', rs(t.itemTotal)],
    ...(t.discount > 0 ? ([[t.couponCode ? `Discount (${pdfText(t.couponCode)})` : 'Discount', `- ${rs(t.discount)}`]] as [string, string][]) : []),
    ['Taxable value', rs(t.taxableTotal)],
    ...(intra
      ? ([
          ['CGST', rs(t.cgst)],
          ['SGST', rs(t.sgst)],
        ] as [string, string][])
      : ([['IGST', rs(t.igst)]] as [string, string][])),
    ['Shipping', t.shipping > 0 ? rs(t.shipping) : 'Free'],
    ...(t.codFee > 0 ? ([['COD fee', rs(t.codFee)]] as [string, string][]) : []),
    ...(t.roundOff !== 0 ? ([['Round off', rs(t.roundOff)]] as [string, string][]) : []),
  ];
  const needed = rows.length * 13 + 60;
  if (y + needed > BOTTOM - 60) {
    pdf.addPage();
    y = MARGIN;
  }
  const labelX = MARGIN + CONTENT_W - 230;
  for (const [label, value] of rows) {
    text(pdf, label, labelX, y, 120, { size: 8.5, color: '#374151' });
    text(pdf, value, labelX + 120, y, 110, { size: 8.5, align: 'right' });
    y += 13;
  }
  hr(pdf, y, labelX, MARGIN + CONTENT_W, '#111827');
  y += 4;
  text(pdf, 'Grand total', labelX, y, 120, { bold: true, size: 10 });
  text(pdf, rs(t.grandTotal), labelX + 120, y, 110, { bold: true, size: 10, align: 'right' });
  y += 18;
  if (t.pricesIncludeGst) {
    text(pdf, 'All prices are inclusive of GST.', MARGIN, y - 14, 280, { size: 8, color: GREY });
  }
  y += text(pdf, `Amount in words: ${pdfText(t.amountInWords)}`, MARGIN, y, CONTENT_W, { bold: true, size: 8.5 }) + 8;

  // ---- HSN summary ----
  if (doc.hsn.length > 0) {
    if (y + 40 + doc.hsn.length * 13 > BOTTOM - 70) {
      pdf.addPage();
      y = MARGIN;
    }
    const hc = intra
      ? ['HSN', 'Rate', 'Taxable', 'CGST', 'SGST', 'Total tax']
      : ['HSN', 'Rate', 'Taxable', 'IGST', 'Total tax'];
    const hw = CONTENT_W / hc.length;
    pdf.save().rect(MARGIN, y, CONTENT_W, 15).fill(HEAD_BG).restore();
    hc.forEach((h, i) => text(pdf, h, MARGIN + i * hw + 2, y + 4, hw - 4, { bold: true, size: 8, align: i === 0 ? 'left' : 'right' }));
    y += 15;
    for (const r of doc.hsn) {
      const vals = intra
        ? [pdfText(r.hsn || '-'), pct(r.taxRatePct), rs(r.taxable), rs(r.cgst), rs(r.sgst), rs(r.totalTax)]
        : [pdfText(r.hsn || '-'), pct(r.taxRatePct), rs(r.taxable), rs(r.igst), rs(r.totalTax)];
      vals.forEach((v, i) => text(pdf, v, MARGIN + i * hw + 2, y + 3, hw - 4, { size: 8, align: i === 0 ? 'left' : 'right' }));
      y += 13;
      hr(pdf, y);
    }
    y += 10;
  }

  // ---- Footer: terms + signatory ----
  if (y + 70 > BOTTOM) {
    pdf.addPage();
    y = MARGIN;
  }
  const declaration = pdfText(s.terms || 'This is a computer generated invoice and does not require a signature.');
  const dh = text(pdf, declaration, MARGIN, y, CONTENT_W - 190, { size: 8, color: GREY });
  text(pdf, `For ${pdfText(s.legalName || s.name)}`, MARGIN + CONTENT_W - 180, y, 180, { bold: true, size: 8.5, align: 'right' });
  text(pdf, 'Authorised Signatory', MARGIN + CONTENT_W - 180, y + Math.max(dh, 36), 180, { size: 8, align: 'right', color: GREY });
}

/** Height of a two-line GST cell, so the row never overlaps the next one. */
function gstCellHeight(pdf: Pdf, s: string, w: number): number {
  return pdf.font('Helvetica').fontSize(8).heightOfString(s, { width: w - 4 }) + 6;
}
