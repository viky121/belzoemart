import PDFDocument from 'pdfkit';
import type { InvoiceDocument } from './invoice-document';
import { buildReceipt, qrMatrix, type ReceiptRow } from './invoice-receipt';

/**
 * The invoice as a PDF: the same 80 mm shop receipt as the HTML invoice (both are drawn from
 * `buildReceipt()`), on one page that is exactly as tall as the bill. Pure JS (pdfkit), no browser needed.
 *
 * pdfkit's built-in Courier covers Latin text only, so the rupee sign is written as "Rs." and any
 * character outside Latin-1 (for example Devanagari in a customer's name) is replaced with "?" in the
 * PDF. The HTML invoice keeps the full text.
 */
const PAGE_W = 226.77; // 80 mm
const MARGIN = 9;
const CONTENT_W = PAGE_W - MARGIN * 2;
const SIZE = { xl: 11.5, lg: 11.5, normal: 7.6, small: 6.6, big: 10 } as const;

/** Latin-1 safe text for the standard PDF fonts. */
export function pdfText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\u20B9/g, 'Rs.')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u00B7]/g, '|')
    .replace(/[\r\t]+/g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?');
}

type Pdf = InstanceType<typeof PDFDocument>;

function logoBuffer(dataUri: string): Buffer | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUri);
  return m ? Buffer.from(m[2]!, 'base64') : null;
}

function put(
  pdf: Pdf,
  s: string,
  x: number,
  y: number,
  w: number,
  o: { bold?: boolean; size: number; align?: 'left' | 'right' | 'center' },
): number {
  const text = pdfText(s);
  pdf.font(o.bold ? 'Courier-Bold' : 'Courier').fontSize(o.size).fillColor('#000');
  const opts = { width: w, align: o.align ?? 'left' } as const;
  pdf.text(text, x, y, opts);
  return pdf.heightOfString(text, opts);
}

function heightOf(pdf: Pdf, s: string, w: number, size: number, bold = false): number {
  pdf.font(bold ? 'Courier-Bold' : 'Courier').fontSize(size);
  return pdf.heightOfString(pdfText(s), { width: w });
}

function rule(pdf: Pdf, y: number, style: 'dash' | 'solid'): void {
  pdf.save().strokeColor('#000').lineWidth(0.6);
  if (style === 'dash') pdf.dash(2, { space: 2 });
  pdf.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke().undash().restore();
}

/** Draws every row from the top and returns the y just below the last one. */
function layout(pdf: Pdf, rows: ReceiptRow[]): number {
  let y = MARGIN;
  for (const r of rows) {
    switch (r.t) {
      case 'logo': {
        const buf = logoBuffer(r.src);
        if (!buf) break;
        try {
          pdf.image(buf, (PAGE_W - 120) / 2, y, { fit: [120, 52], align: 'center' });
          y += 56;
        } catch {
          /* unsupported or corrupt logo: print the bill without it */
        }
        break;
      }
      case 'title':
        y += put(pdf, r.text, MARGIN, y, CONTENT_W, { bold: true, size: SIZE[r.size], align: 'center' }) + 1;
        break;
      case 'center':
        y += put(pdf, r.text, MARGIN, y, CONTENT_W, { bold: r.bold, size: r.small ? SIZE.small : SIZE.normal, align: 'center' }) + 0.5;
        break;
      case 'text':
        y += put(pdf, r.text, MARGIN, y, CONTENT_W, { bold: r.bold, size: r.small ? SIZE.small : SIZE.normal }) + 0.5;
        break;
      case 'rule':
        y += 3;
        rule(pdf, y, r.style);
        y += 4;
        break;
      case 'space':
        y += 5;
        break;
      case 'kv': {
        const size = r.big ? SIZE.big : SIZE.normal;
        const lw = CONTENT_W * 0.55 - 3;
        const rw = CONTENT_W * 0.45;
        const hl = put(pdf, r.left, MARGIN, y, lw, { bold: r.bold, size });
        const hr = put(pdf, r.right, MARGIN + CONTENT_W - rw, y, rw, { bold: r.bold, size, align: 'right' });
        y += Math.max(hl, hr) + 0.5;
        break;
      }
      case 'cols': {
        const size = r.small ? SIZE.small : SIZE.normal;
        let x = MARGIN;
        let rowH = 0;
        for (const c of r.cells) {
          const w = CONTENT_W * c.w - 2;
          const h = put(pdf, c.text, x, y, w, { bold: r.bold, size, align: c.align });
          rowH = Math.max(rowH, h);
          x += CONTENT_W * c.w;
        }
        y += rowH + 1;
        break;
      }
      case 'box': {
        const h = heightOf(pdf, r.text, CONTENT_W - 8, SIZE.normal, true);
        pdf.save().strokeColor('#000').lineWidth(0.8).rect(MARGIN, y, CONTENT_W, h + 6).stroke().restore();
        put(pdf, r.text, MARGIN + 4, y + 3, CONTENT_W - 8, { bold: true, size: SIZE.normal, align: 'center' });
        y += h + 10;
        break;
      }
      case 'qr': {
        const m = qrMatrix(r.data);
        const side = 96;
        const cell = side / (m.length + 8);
        const x0 = (PAGE_W - side) / 2;
        pdf.save().fillColor('#000');
        m.forEach((row, my) =>
          row.forEach((dark, mx) => {
            if (dark) pdf.rect(x0 + (mx + 4) * cell, y + (my + 4) * cell, cell + 0.15, cell + 0.15).fill();
          }),
        );
        pdf.restore();
        y += side + 1;
        if (r.caption) y += put(pdf, r.caption, MARGIN, y, CONTENT_W, { size: SIZE.small, align: 'center' }) + 1;
        break;
      }
    }
  }
  return y;
}

export function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const rows = buildReceipt(doc);
      // Pass 1: measure on a very tall throw-away page, so the real page can be exactly as tall as the bill.
      const probe = new PDFDocument({ size: [PAGE_W, 20000], margin: 0, autoFirstPage: true });
      probe.on('data', () => undefined);
      probe.on('error', reject);
      const height = layout(probe, rows) + MARGIN;
      probe.end();

      const pdf = new PDFDocument({
        size: [PAGE_W, Math.max(height, 120)],
        margin: 0,
        info: { Title: `Tax Invoice ${pdfText(doc.number)}`, Author: pdfText(doc.seller.name), Subject: `Order #${doc.orderNo}` },
      });
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      layout(pdf, rows);
      pdf.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
