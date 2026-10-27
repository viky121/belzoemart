import { computeTotals, paise } from '@belzo/shared';
import {
  buildInvoiceDocument,
  escapeHtml,
  type BuildInvoiceInput,
  type InvoiceOrder,
  type InvoiceSeller,
} from './invoice-document';
import { renderInvoicePdf, pdfText } from './invoice-pdf';
import { amt, buildReceipt, FOOD_DECLARATION, maskPhone, qrMatrix, renderInvoiceHtml, type ReceiptRow } from './invoice-receipt';

/**
 * The 80 mm receipt: what is printed (HTML and PDF both come from `buildReceipt`), escaping, the
 * intra/inter-state GST lines, COD vs paid payment block, FSSAI lines, savings box and QR code.
 */
const SELLER: InvoiceSeller = {
  name: 'Belzo eMart',
  legalName: 'Belzo eMart',
  address: 'Brahman colony, Kunvar Pura Road',
  city: 'Tikamgarh',
  state: 'Madhya Pradesh',
  stateCode: '23',
  pincode: '472001',
  gstin: '23ABHFB6830B1ZY',
  pan: 'ABHFB6830B',
  phone: '8839095625',
  email: 'belzoemart@gmail.com',
  website: 'https://belzoemart.com/',
  logoUrl: null,
  terms: null,
  fssai: '21426510000951',
};
const ITEMS = [
  { variantId: 'v-1', title: 'Cold-Pressed Oil 1L', sku: 'OIL-1', unitPrice: 29900, quantity: 2, taxRatePct: 5, mrp: 34900 },
  { variantId: 'v-2', title: 'Dry Fruits Mix 500g', sku: 'DF-500', unitPrice: 19900, quantity: 1, taxRatePct: 12, mrp: 27500 },
];
const ADDRESS = {
  fullName: 'Mukesh Jain',
  phone: '8770423034',
  line1: 'Shanti Nagar',
  line2: null,
  city: 'Tikamgarh',
  state: 'Madhya Pradesh',
  pincode: '472001',
};
const T0 = new Date('2026-10-25T04:20:00Z');

function orderOf(opts: { sameState?: boolean; cod?: boolean; coupon?: boolean; shipping?: number; items?: typeof ITEMS } = {}): InvoiceOrder {
  const { sameState = true, cod = true, coupon = true, shipping = 0, items = ITEMS } = opts;
  const b = computeTotals({
    lines: items.map((i) => ({ unitPrice: paise(i.unitPrice), quantity: i.quantity, taxRatePct: i.taxRatePct })),
    sameState,
    shipping: paise(shipping),
    codFee: paise(0),
    coupon: coupon ? { kind: 'flat', value: paise(5000) } : undefined,
  });
  return {
    id: '3f2a1c9e-4d5b-4c1a-9e33-7b5a1f0c2d11',
    createdAt: T0,
    couponCode: coupon ? 'SAVE50' : null,
    subtotal: b.subtotal,
    discount: b.discount,
    shipping: b.shipping,
    codFee: b.codFee,
    tax: b.tax,
    cgst: b.gst.cgst,
    sgst: b.gst.sgst,
    igst: b.gst.igst,
    grandTotal: b.grandTotal,
    items,
    payments: [
      cod
        ? { provider: 'cod', status: 'created', method: null, createdAt: T0 }
        : { provider: 'razorpay', status: 'captured', method: 'upi', providerPaymentId: 'pay_ABC123xyz', createdAt: T0 },
    ],
  };
}

function docOf(order: InvoiceOrder, over: Partial<BuildInvoiceInput> = {}) {
  return buildInvoiceDocument({
    number: 'BELZO/2026/00042',
    invoiceDate: new Date('2026-10-25T04:25:00Z'),
    order,
    hsnByVariant: new Map([
      ['v-1', '1508'],
      ['v-2', '080410'],
    ]),
    publicBaseUrl: 'https://belzoemart.com',
    address: ADDRESS,
    customer: { name: 'Mukesh Jain', email: null, phone: '8770423034' },
    seller: SELLER,
    ...over,
  });
}

const texts = (rows: ReceiptRow[]): string[] =>
  rows.flatMap((r) => {
    switch (r.t) {
      case 'kv':
        return [`${r.left}|${r.right}`];
      case 'cols':
        return [r.cells.map((c) => c.text).join('|')];
      case 'title':
      case 'center':
      case 'text':
      case 'box':
        return [r.text];
      default:
        return [];
    }
  });

describe('buildReceipt — content', () => {
  it('prints the store block, FSSAI, TAX INVOICE and the invoice references', () => {
    const lines = texts(buildReceipt(docOf(orderOf())));
    for (const s of [
      'BELZO EMART',
      'Customer Care: 8839095625',
      'belzoemart@gmail.com',
      'GSTIN: 23ABHFB6830B1ZY  (State code 23)',
      'FSSAI Lic No: 21426510000951',
      'TAX INVOICE',
      '*** Original for Recipient ***',
      'Invoice No|BELZO/2026/00042',
      'Date|25/10/2026 09:55 AM',
      'Order No|#3F2A1C9E',
      'Place of Supply|Madhya Pradesh (23)',
      'Tax Invoice No|BELZO/2026/00042',
      'Order ID: 3f2a1c9e-4d5b-4c1a-9e33-7b5a1f0c2d11',
      '* Thank you for shopping with Belzo eMart *',
      'Returns & refunds: https://belzoemart.com/page/returns-policy',
    ]) {
      expect(lines).toContain(s);
    }
  });

  it('shows the customer name, a masked mobile number and the delivery address, never the full number', () => {
    const lines = texts(buildReceipt(docOf(orderOf())));
    expect(lines).toContain('Customer|Mukesh Jain');
    expect(lines).toContain('Mobile|87XXXXXX34');
    expect(lines.join('\n')).not.toContain('8770423034');
    expect(lines).toContain('Deliver to: Shanti Nagar, Tikamgarh - 472001');
  });

  it('shows the FSSAI licence and the food declaration only when the store has a licence number', () => {
    const withLic = texts(buildReceipt(docOf(orderOf())));
    expect(withLic).toContain(FOOD_DECLARATION);
    const without = texts(buildReceipt(docOf(orderOf(), { seller: { ...SELLER, fssai: null } })));
    expect(without).not.toContain(FOOD_DECLARATION);
    expect(without.join('\n')).not.toContain('FSSAI');
  });

  it('GSTIN: Not registered when the store has none', () => {
    const lines = texts(buildReceipt(docOf(orderOf(), { seller: { ...SELLER, gstin: null, pan: null } })));
    expect(lines).toContain('GSTIN: Not registered');
  });

  it('intra-state: CGST and SGST above each item and in the GST breakup', () => {
    const lines = texts(buildReceipt(docOf(orderOf({ sameState: true }))));
    expect(lines).toContain('1) CGST @ 2.5%  SGST @ 2.5%');
    expect(lines).toContain('2) CGST @ 6%  SGST @ 6%');
    expect(lines).toContain('GST%|Taxable|CGST|SGST|Total');
    expect(lines.join('\n')).not.toContain('IGST');
  });

  it('inter-state: IGST above each item and in the GST breakup', () => {
    const doc = docOf(orderOf({ sameState: false }), { address: { ...ADDRESS, state: 'Maharashtra' } });
    const lines = texts(buildReceipt(doc));
    expect(lines).toContain('1) IGST @ 5%');
    expect(lines).toContain('2) IGST @ 12%');
    expect(lines).toContain('GST%|Taxable|IGST|Total');
    expect(lines.join('\n')).not.toContain('CGST');
    expect(lines).toContain('Place of Supply|Maharashtra (27)');
  });

  it('the GST breakup adds up to the net sales value', () => {
    const doc = docOf(orderOf());
    const rows = buildReceipt(doc);
    const total = rows.find((r) => r.t === 'cols' && r.cells[0]?.text === 'Total' && r.cells.length === 5);
    expect(total).toBeDefined();
    const last = (total as Extract<ReceiptRow, { t: 'cols' }>).cells[4]!.text;
    expect(last).toBe(amt(doc.totals.netTotal));
  });

  it('the savings box adds the MRP saving and the coupon', () => {
    const doc = docOf(orderOf());
    // (349 - 299) x 2 + (275 - 199) = 176.00 MRP saving, plus the Rs 50 coupon
    expect(doc.productDiscount).toBe(17600);
    expect(doc.savings).toBe(22600);
    const lines = texts(buildReceipt(doc));
    expect(lines).toContain('You have saved Rs. 226.00');
    expect(lines).toContain('Gross Sales Value (MRP)|973.00');
    expect(lines).toContain('Product Discount|-176.00');
    expect(lines).toContain('Coupon Discount (SAVE50)|-50.00');
    expect(lines).toContain('Delivery Charges|FREE');
  });

  it('no savings box and no MRP lines when MRP equals the price', () => {
    const items = ITEMS.map((i) => ({ ...i, mrp: i.unitPrice }));
    const lines = texts(buildReceipt(docOf(orderOf({ items, coupon: false }))));
    expect(lines.join('\n')).not.toContain('You have saved');
    expect(lines.join('\n')).not.toContain('Gross Sales Value');
  });

  it('an older order without a saved MRP uses the variant MRP of today, never below the price', () => {
    const items = ITEMS.map((i) => ({ ...i, mrp: undefined as number | undefined }));
    const order = orderOf({ coupon: false });
    order.items = items as InvoiceOrder['items'];
    const doc = docOf(order, { mrpByVariant: new Map([['v-1', 34900], ['v-2', 100]]) });
    expect(doc.lines[0]!.mrp).toBe(34900);
    expect(doc.lines[1]!.mrp).toBe(19900); // MRP below the price is clamped to the price
  });

  it('Cash on Delivery: the whole amount is still to pay', () => {
    const doc = docOf(orderOf({ cod: true }));
    const lines = texts(buildReceipt(doc));
    expect(doc.balanceDue).toBe(doc.totals.grandTotal);
    expect(lines).toContain('Payment Mode|Cash on Delivery');
    expect(lines).toContain('Amount Paid|Rs. 0.00');
    expect(lines).toContain(`To Pay on Delivery|Rs. ${amt(doc.totals.grandTotal)}`);
    expect(lines.join('\n')).not.toContain('Payment Ref No');
  });

  it('a paid online order shows Paid, the amount paid and the payment reference', () => {
    const doc = docOf(orderOf({ cod: false }));
    const lines = texts(buildReceipt(doc));
    expect(doc.balanceDue).toBe(0);
    expect(lines).toContain('Payment Status|Paid');
    expect(lines).toContain(`Amount Paid|Rs. ${amt(doc.totals.grandTotal)}`);
    expect(lines).toContain('Payment Ref No|pay_ABC123xyz');
    expect(lines.join('\n')).not.toContain('To Pay on Delivery');
    expect(lines.join('\n')).not.toContain('Balance Due');
  });

  it('shows a delivery charge when there is one', () => {
    const lines = texts(buildReceipt(docOf(orderOf({ shipping: 4900 }))));
    expect(lines).toContain('Delivery Charges|49.00');
  });

  it('the total row is the stored grand total', () => {
    const doc = docOf(orderOf());
    expect(texts(buildReceipt(doc))).toContain(`TOTAL AMOUNT|Rs. ${amt(doc.totals.grandTotal)}`);
  });

  it('QR code row points at the order page; none without a website', () => {
    const rows = buildReceipt(docOf(orderOf()));
    expect(rows.find((r) => r.t === 'qr')).toMatchObject({ data: 'https://belzoemart.com/orders/3f2a1c9e-4d5b-4c1a-9e33-7b5a1f0c2d11' });
    const none = buildReceipt(docOf(orderOf(), { publicBaseUrl: null }));
    expect(none.find((r) => r.t === 'qr')).toBeUndefined();
  });

  it('uses the store terms when set', () => {
    const lines = texts(buildReceipt(docOf(orderOf(), { seller: { ...SELLER, terms: 'No returns on opened food.' } })));
    expect(lines).toContain('No returns on opened food.');
    expect(lines.join('\n')).not.toContain('Goods once sold');
  });
});

describe('helpers', () => {
  it('amt groups digits the Indian way', () => {
    expect(amt(0)).toBe('0.00');
    expect(amt(12345678)).toBe('1,23,456.78');
    expect(amt(-5000)).toBe('-50.00');
  });
  it('maskPhone keeps the first two and last two digits', () => {
    expect(maskPhone('9876543210')).toBe('98XXXXXX10');
    expect(maskPhone('+91 98765 43210')).toBe('98XXXXXX10');
    expect(maskPhone('123')).toBeNull();
    expect(maskPhone(null)).toBeNull();
  });
  it('qrMatrix is a square grid and the same every time', () => {
    const a = qrMatrix('https://belzoemart.com/orders/abc');
    expect(a.length).toBeGreaterThanOrEqual(21);
    expect(a.every((row) => row.length === a.length)).toBe(true);
    expect(a.flat().some(Boolean)).toBe(true);
    expect(qrMatrix('https://belzoemart.com/orders/abc')).toEqual(a);
    expect(qrMatrix('https://belzoemart.com/orders/abd')).not.toEqual(a);
  });
  it('escapeHtml handles all special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
  });
  it('pdfText keeps Latin-1 and replaces everything else', () => {
    expect(pdfText('\u20B9 5 \u2013 \u0905')).toBe('Rs. 5 - ?');
  });
});

describe('renderInvoiceHtml', () => {
  it('escapes user-entered text everywhere', () => {
    const items = [{ ...ITEMS[0]!, title: '<script>alert(1)</script>' }, ITEMS[1]!];
    const html = renderInvoiceHtml(
      docOf(orderOf({ items }), {
        address: { ...ADDRESS, line1: 'A & B "x"', fullName: "O'Neil <b>" },
        customer: { name: '<img src=x onerror=alert(2)>', email: null, phone: null },
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B &quot;x&quot;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/<script/i);
    expect(html.match(/\son[a-z]+="[^"]*"/gi) ?? []).toEqual([' onclick="window.print()"']);
  });

  it('is an 80 mm receipt page with a print button, the QR code and the amounts', () => {
    const doc = docOf(orderOf());
    const html = renderInvoiceHtml(doc);
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('Print / Save as PDF');
    expect(html).toContain('<svg class="qr"');
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('You have saved Rs. 226.00');
    expect(html).toContain(`Rs. ${amt(doc.totals.grandTotal)}`);
    expect(html).toContain('<title>Tax Invoice BELZO/2026/00042</title>');
  });

  it('only embeds an http(s) or base64 image logo', () => {
    const withLogo = (logoUrl: string) => renderInvoiceHtml(docOf(orderOf(), { seller: { ...SELLER, logoUrl } }));
    expect(withLogo('https://cdn.x/logo.png')).toContain('<img class="logo" src="https://cdn.x/logo.png"');
    expect(withLogo('data:image/png;base64,iVBORw0KGgo=')).toContain('<img class="logo" src="data:image/png;base64,iVBORw0KGgo="');
    const bad = withLogo('javascript:alert(1)');
    expect(bad).not.toContain('<img');
    expect(bad).not.toContain('javascript:');
    expect(withLogo('data:text/html;base64,PGI+')).not.toContain('<img');
  });

  it('renders without a customer address or name', () => {
    const html = renderInvoiceHtml(docOf(orderOf(), { address: null, customer: null }));
    expect(html).toContain('Place of Supply');
    expect(html).not.toContain('Deliver to');
  });
});

describe('renderInvoicePdf', () => {
  const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;
  it('is a one-page PDF that is 80 mm wide', async () => {
    const pdf = await renderInvoicePdf(docOf(orderOf()));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 226\.77 \d+(\.\d+)?\]/);
  });
  it('works with a PNG logo, a missing logo and a bad logo', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    for (const logoUrl of [png, null, 'data:image/png;base64,AAAA']) {
      const pdf = await renderInvoicePdf(docOf(orderOf(), { seller: { ...SELLER, logoUrl } }));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
  it('a long bill is still one page; a Devanagari name does not break it', async () => {
    const many = Array.from({ length: 40 }, (_, n) => ({ ...ITEMS[n % 2]!, variantId: n % 2 ? 'v-2' : 'v-1', title: `Item number ${n + 1} with a fairly long description` }));
    const pdf = await renderInvoicePdf(docOf(orderOf({ items: many }), { customer: { name: 'मुकेश जैन', email: null, phone: null } }));
    expect(pages(pdf)).toBe(1);
  });
});
