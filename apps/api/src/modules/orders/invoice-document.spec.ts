import { computeTotals, paise } from '@belzo/shared';
import {
  buildInvoiceDocument,
  escapeHtml,
  renderInvoiceHtml,
  type BuildInvoiceInput,
  type InvoiceOrder,
  type InvoiceSeller,
} from './invoice-document';

/**
 * Pure invoice builder/template tests: per-line allocations reconcile EXACTLY
 * to the stored order snapshot (discount, taxable, CGST/SGST/IGST, grand total)
 * for both GST-exclusive and GST-inclusive snapshots, intra vs inter-state
 * columns, HTML escaping and the fixed compliance texts.
 */

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

const SELLER: InvoiceSeller = {
  name: 'Belzo eMart',
  legalName: 'Belzo Retail Pvt Ltd',
  address: '12 MG Road\nIndiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  stateCode: '29',
  pincode: '560038',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  phone: '+91 80 1234 5678',
  email: 'support@belzo.example',
  website: 'https://belzo.example',
  logoUrl: null,
  terms: null,
};

const ITEMS = [
  { variantId: 'v-1', title: 'Basmati Rice 5kg', sku: 'RICE-5KG', unitPrice: 49900, quantity: 2, taxRatePct: 5 },
  { variantId: 'v-2', title: 'Green Tea 100g', sku: 'TEA-100', unitPrice: 29900, quantity: 1, taxRatePct: 18 },
  { variantId: 'v-3', title: 'Masala Chai 250g', sku: 'CHAI-250', unitPrice: 15050, quantity: 3, taxRatePct: 5 },
];

/** GST-exclusive snapshot exactly as checkout's computeTotals stores it. */
function exclusiveOrder(sameState: boolean, items = ITEMS): InvoiceOrder {
  const b = computeTotals({
    lines: items.map((i) => ({ unitPrice: paise(i.unitPrice), quantity: i.quantity, taxRatePct: i.taxRatePct })),
    sameState,
    shipping: paise(4900),
    codFee: paise(3900),
    coupon: { kind: 'flat', value: 3333 },
  });
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    createdAt: new Date('2025-03-14T10:00:00Z'),
    couponCode: 'SAVE33',
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
    payments: [{ provider: 'cod', status: 'created', method: null, createdAt: new Date('2025-03-14T10:00:00Z') }],
  };
}

/** GST-inclusive snapshot: tax extracted from the price, grandTotal = net + shipping + codFee. */
function inclusiveOrder(sameState: boolean): InvoiceOrder {
  const subtotal = sum(ITEMS.map((i) => i.unitPrice * i.quantity));
  const discount = 3333;
  const net = subtotal - discount;
  const tax = Math.round((net * 18) / 118);
  const cgst = sameState ? Math.floor(tax / 2) : 0;
  const sgst = sameState ? tax - cgst : 0;
  const igst = sameState ? 0 : tax;
  return {
    id: 'b1b2c3d4-0000-4000-8000-000000000002',
    createdAt: new Date('2025-03-14T10:00:00Z'),
    couponCode: null,
    subtotal,
    discount,
    shipping: 0,
    codFee: 0,
    tax,
    cgst,
    sgst,
    igst,
    grandTotal: net,
    items: ITEMS,
    payments: [{ provider: 'razorpay', status: 'captured', method: 'upi', createdAt: new Date('2025-03-14T10:01:00Z') }],
  };
}

const ADDRESS_KA = {
  fullName: 'Asha Rao',
  phone: '9876543210',
  line1: '221B Residency Road',
  line2: 'Near Park',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560025',
};
const ADDRESS_MH = { ...ADDRESS_KA, city: 'Mumbai', state: 'Maharashtra', pincode: '400001' };

function input(order: InvoiceOrder, over: Partial<BuildInvoiceInput> = {}): BuildInvoiceInput {
  return {
    number: 'BELZO/2025/00042',
    invoiceDate: new Date('2025-03-14T12:00:00Z'),
    order,
    hsnByVariant: new Map([
      ['v-1', '1006'],
      ['v-2', '0902'],
      ['v-3', '1006'],
    ]),
    address: ADDRESS_KA,
    customer: { name: 'Asha R', email: 'asha@example.com', phone: '9876543210' },
    seller: SELLER,
    ...over,
  };
}

/** Every column reconciles exactly to the stored snapshot. */
function expectReconciles(order: InvoiceOrder, doc: ReturnType<typeof buildInvoiceDocument>) {
  expect(sum(doc.lines.map((l) => l.discount))).toBe(order.discount);
  expect(sum(doc.lines.map((l) => l.cgst))).toBe(order.cgst);
  expect(sum(doc.lines.map((l) => l.sgst))).toBe(order.sgst);
  expect(sum(doc.lines.map((l) => l.igst))).toBe(order.igst);
  const taxable = order.grandTotal - order.shipping - order.codFee - order.tax;
  expect(sum(doc.lines.map((l) => l.taxable))).toBe(taxable);
  expect(doc.totals.taxableTotal).toBe(taxable);
  expect(sum(doc.lines.map((l) => l.total)) + order.shipping + order.codFee).toBe(order.grandTotal);
  expect(doc.totals.roundOff).toBe(0);
  expect(doc.totals.grandTotal).toBe(order.grandTotal);
  doc.lines.forEach((l) => {
    expect(l.discount).toBeLessThanOrEqual(l.gross);
    expect(l.total).toBe(l.taxable + l.cgst + l.sgst + l.igst);
  });
  expect(doc.hsnTotals.taxable).toBe(taxable);
  expect(doc.hsnTotals.totalTax).toBe(order.tax);
}

describe('buildInvoiceDocument — reconciliation', () => {
  it('intra-state GST-exclusive order: lines sum exactly to stored discount/CGST/SGST/grand total', () => {
    const order = exclusiveOrder(true);
    expect(order.cgst).toBeGreaterThan(0);
    const doc = buildInvoiceDocument(input(order));
    expect(doc.showIntra).toBe(true);
    expect(doc.showInter).toBe(false);
    expectReconciles(order, doc);
    // exclusive: taxable value = gross - discount
    expect(doc.totals.taxableTotal).toBe(order.subtotal - order.discount);
    expect(doc.totals.pricesIncludeGst).toBe(false);
    expect(doc.lines.map((l) => l.cgstRate)).toEqual([2.5, 9, 2.5]);

    const html = renderInvoiceHtml(doc);
    expect(html).toContain('<th>CGST %</th>');
    expect(html).toContain('<th>SGST ₹</th>');
    expect(html).not.toContain('IGST');
  });

  it('inter-state GST-exclusive order: IGST columns only, lines sum to stored IGST', () => {
    const order = exclusiveOrder(false);
    expect(order.igst).toBeGreaterThan(0);
    const doc = buildInvoiceDocument(input(order, { address: ADDRESS_MH }));
    expect(doc.showInter).toBe(true);
    expect(doc.showIntra).toBe(false);
    expectReconciles(order, doc);
    expect(doc.lines.map((l) => l.igstRate)).toEqual([5, 18, 5]);

    const html = renderInvoiceHtml(doc);
    expect(html).toContain('<th>IGST %</th>');
    expect(html).toContain('<th>IGST ₹</th>');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).toContain('Maharashtra (27)');
  });

  it('intra-state GST-inclusive order: taxable = grandTotal - shipping - codFee - tax, reconciles exactly', () => {
    const order = inclusiveOrder(true);
    const doc = buildInvoiceDocument(input(order));
    expectReconciles(order, doc);
    expect(doc.totals.pricesIncludeGst).toBe(true);
    // inclusive: line total equals the price as sold after discount
    doc.lines.forEach((l) => expect(l.total).toBe(l.gross - l.discount));
    expect(doc.lines[0]!.unitPrice).toBe(49900);
    const html = renderInvoiceHtml(doc);
    expect(html).toContain('inclusive of GST');
  });

  it('inter-state GST-inclusive order reconciles exactly to grand total', () => {
    const order = inclusiveOrder(false);
    const doc = buildInvoiceDocument(input(order, { address: ADDRESS_MH }));
    expect(doc.showInter).toBe(true);
    expectReconciles(order, doc);
  });

  it('allocates the stored tax pro-rata to line net with the remainder on the last line', () => {
    const order = exclusiveOrder(true);
    const doc = buildInvoiceDocument(input(order));
    const nets = doc.lines.map((l) => l.gross - l.discount);
    const netSum = sum(nets);
    doc.lines.slice(0, -1).forEach((l, i) => {
      expect(l.cgst).toBe(Math.floor((order.cgst * nets[i]!) / netSum));
    });
  });

  it('groups lines with the same HSN + rate into one HSN summary row', () => {
    const doc = buildInvoiceDocument(input(exclusiveOrder(true)));
    expect(doc.hsn.map((h) => `${h.hsn}|${h.taxRatePct}`)).toEqual(['1006|5', '0902|18']);
    const rice = doc.hsn[0]!;
    expect(rice.taxable).toBe(doc.lines[0]!.taxable + doc.lines[2]!.taxable);
    expect(rice.totalTax).toBe(rice.cgst + rice.sgst + rice.igst);
  });

  it("shows '-' for a missing HSN code", () => {
    const doc = buildInvoiceDocument(input(exclusiveOrder(true), { hsnByVariant: new Map() }));
    expect(doc.lines.every((l) => l.hsn === '-')).toBe(true);
  });

  it('shows a round-off row only when the stored grand total differs from the computed sum', () => {
    const consistent = renderInvoiceHtml(buildInvoiceDocument(input(exclusiveOrder(true))));
    expect(consistent).not.toContain('Round-off');

    const order = exclusiveOrder(true);
    // A snapshot whose grand total is not reconstructible from its parts (e.g. legacy data).
    const odd = { ...order, grandTotal: order.grandTotal, tax: order.tax - 40, cgst: order.cgst - 20, sgst: order.sgst - 20 };
    const doc = buildInvoiceDocument(input(odd));
    expect(doc.totals.grandTotal).toBe(order.grandTotal);
    expect(doc.totals.amountInWords).toMatch(/^Rupees .* Only$/);
    // taxable derived from the snapshot absorbs it -> still reconciles, no fabricated total
    expect(sum(doc.lines.map((l) => l.total)) + odd.shipping + odd.codFee).toBe(order.grandTotal);

    // Negative taxable cannot be represented; the gap is shown explicitly.
    const broken = { ...order, grandTotal: 100 };
    const bdoc = buildInvoiceDocument(input(broken));
    expect(bdoc.totals.roundOff).not.toBe(0);
    expect(renderInvoiceHtml(bdoc)).toContain('Round-off');
  });

  it('prints the grand total and amount in words from the stored value', () => {
    const order = { ...exclusiveOrder(true) };
    const doc = buildInvoiceDocument(input(order));
    const html = renderInvoiceHtml(doc);
    expect(doc.totals.amountInWords).toMatch(/^Rupees /);
    expect(html).toContain(doc.totals.amountInWords);
    expect(html).toContain('GRAND TOTAL');
  });
});

describe('renderInvoiceHtml — content and escaping', () => {
  it('escapes user-entered text everywhere', () => {
    const order = exclusiveOrder(true, [{ ...ITEMS[0]!, title: '<script>alert(1)</script>' }]);
    const html = renderInvoiceHtml(
      buildInvoiceDocument(
        input(order, {
          address: { ...ADDRESS_KA, line1: 'A & B "x"', fullName: "O'Neil <b>" },
          customer: { name: '<img src=x onerror=alert(2)>', email: null, phone: null },
        }),
      ),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B &quot;x&quot;');
    expect(html).toContain('O&#39;Neil &lt;b&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/<script/i);
    const handlers = html.match(/\son[a-z]+="[^"]*"/gi) ?? [];
    expect(handlers).toEqual([' onclick="window.print()"']);
  });

  it('escapeHtml handles all special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
  });

  it("prints 'GSTIN: Not registered' and no PAN when the GSTIN is unset", () => {
    const html = renderInvoiceHtml(
      buildInvoiceDocument(input(exclusiveOrder(true), { seller: { ...SELLER, gstin: null, pan: null } })),
    );
    expect(html).toContain('GSTIN:</span> Not registered');
    expect(html).not.toContain('PAN:');
    expect(html).not.toContain('GSTIN-UNSET');
  });

  it('prints GSTIN and PAN when registered', () => {
    const html = renderInvoiceHtml(buildInvoiceDocument(input(exclusiveOrder(true))));
    expect(html).toContain('29ABCDE1234F1Z5');
    expect(html).toContain('PAN:</span> ABCDE1234F');
  });

  it('includes the required fixed texts, meta and parties', () => {
    const order = exclusiveOrder(true);
    const html = renderInvoiceHtml(buildInvoiceDocument(input(order)));
    for (const s of [
      'TAX INVOICE',
      'ORIGINAL FOR RECIPIENT',
      'Reverse charge',
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
      'This is a computer-generated invoice and does not require a physical signature.',
      'Authorised Signatory',
      'For <strong>Belzo Retail Pvt Ltd</strong>',
      'Place of Supply',
      'Karnataka (29)',
      'BELZO/2025/00042',
      '#A1B2C3D4',
      order.id,
      '14 Mar 2025',
      'Cash on Delivery',
      'Pending – pay on delivery',
      'Bill To',
      'Ship To',
      'Asha R',
      'asha@example.com',
      'Coupon: SAVE33',
      'COD fee',
      'HSN/SAC summary',
      'Print / Save as PDF',
      '@media print',
      'size: A4',
      'Trade name: Belzo eMart',
      'Bengaluru - 560038',
      'Karnataka (Code 29)',
      'For support contact support@belzo.example | +91 80 1234 5678',
      "Goods once sold are subject to the store's return policy.".replace("'", '&#39;'),
    ]) {
      expect(html).toContain(s);
    }
    // Indian digit grouping
    expect(html).toMatch(/₹1,\d{2},\d{3}\.\d{2}|₹\d{1,2},\d{3}\.\d{2}/);
  });

  it('shows Razorpay payment details and Paid status', () => {
    const html = renderInvoiceHtml(buildInvoiceDocument(input(inclusiveOrder(true))));
    expect(html).toContain('Online (Razorpay · upi)');
    expect(html).toContain('>Paid<');
  });

  it("renders '-' for a missing address and customer without throwing", () => {
    const doc = buildInvoiceDocument(input(exclusiveOrder(true), { address: null, customer: null }));
    expect(doc.placeOfSupply).toBe('-');
    expect(doc.billTo.name).toBeNull();
    const html = renderInvoiceHtml(doc);
    expect(html).toContain('Bill To');
    expect(html).toContain('<div class="party-name">-</div>');
  });

  it('only embeds an http(s) logo URL', () => {
    const ok = renderInvoiceHtml(
      buildInvoiceDocument(input(exclusiveOrder(true), { seller: { ...SELLER, logoUrl: 'https://cdn.x/logo.png' } })),
    );
    expect(ok).toContain('<img src="https://cdn.x/logo.png"');
    const bad = renderInvoiceHtml(
      buildInvoiceDocument(input(exclusiveOrder(true), { seller: { ...SELLER, logoUrl: 'javascript:alert(1)' } })),
    );
    expect(bad).not.toContain('<img');
    expect(bad).not.toContain('javascript:');
  });
});
