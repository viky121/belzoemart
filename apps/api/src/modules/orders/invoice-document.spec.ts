import {
  computeGst,
  computeTotals,
  couponDiscount,
  inclusiveLineTaxes,
  isGstInclusiveSnapshot,
  paise,
  subtotalOf,
  weightedTaxRate,
} from '@belzo/shared';
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

type Item = (typeof ITEMS)[number];
const toLines = (items: Item[]) =>
  items.map((i) => ({ unitPrice: paise(i.unitPrice), quantity: i.quantity, taxRatePct: i.taxRatePct }));

/**
 * Money fields of a LEGACY GST-exclusive snapshot, as checkout stored it BEFORE
 * the GST-inclusive switch: tax = blended rate × (subtotal − discount), added on top.
 */
function legacyExclusiveBreakup(items: Item[], sameState: boolean, shipping: number, codFee: number, flatCoupon: number) {
  const lines = toLines(items);
  const subtotal = subtotalOf(lines);
  const discount = couponDiscount(flatCoupon > 0 ? { kind: 'flat', value: flatCoupon } : undefined, subtotal);
  const taxable = subtotal - discount;
  const gst = computeGst(paise(taxable), weightedTaxRate(lines), sameState);
  const tax = gst.cgst + gst.sgst + gst.igst;
  return { subtotal, discount, shipping, codFee, tax, gst, grandTotal: taxable + tax + shipping + codFee };
}

/** GST-exclusive snapshot as checkout stored it BEFORE the inclusive switch (historical orders). */
function legacyExclusiveOrder(sameState: boolean, items = ITEMS): InvoiceOrder {
  const b = legacyExclusiveBreakup(items, sameState, 4900, 3900, 3333);
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

/** Snapshot exactly as checkout now stores it: the NEW GST-inclusive computeTotals engine. */
function engineOrder(
  sameState: boolean,
  items: Item[] = ITEMS,
  opts: { shipping?: number; codFee?: number; flatCoupon?: number } = {},
): InvoiceOrder {
  const { shipping = 4900, codFee = 3900, flatCoupon = 3333 } = opts;
  const b = computeTotals({
    lines: toLines(items),
    sameState,
    shipping: paise(shipping),
    codFee: paise(codFee),
    coupon: flatCoupon > 0 ? { kind: 'flat', value: flatCoupon } : undefined,
  });
  return {
    id: 'c1b2c3d4-0000-4000-8000-000000000003',
    createdAt: new Date('2025-03-14T10:00:00Z'),
    couponCode: flatCoupon > 0 ? 'SAVE33' : null,
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
    const order = legacyExclusiveOrder(true);
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
    const order = legacyExclusiveOrder(false);
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

  it('allocates the stored tax by line net x line rate with the remainder on the last line', () => {
    const order = legacyExclusiveOrder(true);
    const doc = buildInvoiceDocument(input(order));
    const weights = doc.lines.map((l) => (l.gross - l.discount) * l.taxRatePct);
    const wSum = sum(weights);
    doc.lines.slice(0, -1).forEach((l, i) => {
      expect(l.cgst).toBe(Math.floor((order.cgst * weights[i]!) / wSum));
      expect(l.sgst).toBe(Math.floor((order.sgst * weights[i]!) / wSum));
    });
    // Each line's tax tracks its own printed rate (within the engine's blended-rate drift),
    // not the cart's blended rate: the 18% line carries far more tax per rupee than the 5% lines.
    const [rice, tea] = doc.lines;
    expect((tea!.cgst + tea!.sgst) / tea!.taxable).toBeGreaterThan(((rice!.cgst + rice!.sgst) / rice!.taxable) * 3);
    doc.lines.forEach((l) => {
      const expected = (l.taxable * l.taxRatePct) / 100;
      expect(Math.abs(l.cgst + l.sgst - expected)).toBeLessThanOrEqual(expected * 0.1 + 2);
    });
  });

  it('gives a 0% line no tax when another line in the cart is taxed', () => {
    const items = [
      { variantId: 'v-1', title: 'Fresh Milk 1L', sku: 'MILK-1L', unitPrice: 6800, quantity: 2, taxRatePct: 0 },
      { variantId: 'v-2', title: 'Green Tea 100g', sku: 'TEA-100', unitPrice: 29900, quantity: 1, taxRatePct: 18 },
    ];
    for (const sameState of [true, false]) {
      const order = legacyExclusiveOrder(sameState, items);
      expect(order.tax).toBeGreaterThan(0);
      const doc = buildInvoiceDocument(input(order, { address: sameState ? ADDRESS_KA : ADDRESS_MH }));
      expectReconciles(order, doc);
      const milk = doc.lines[0]!;
      expect(milk.cgst + milk.sgst + milk.igst).toBe(0);
      expect(milk.total).toBe(milk.taxable);
      const zeroRow = doc.hsn.find((h) => h.taxRatePct === 0)!;
      expect(zeroRow.totalTax).toBe(0);
    }
  });

  it('falls back to net weights when tax was stored but every line rate is 0 (legacy snapshot)', () => {
    const order = legacyExclusiveOrder(true);
    const legacy = { ...order, items: order.items.map((i) => ({ ...i, taxRatePct: 0 })) };
    const doc = buildInvoiceDocument(input(legacy));
    expectReconciles(legacy, doc);
  });

  it('zero-tax inter-state order: falls back to state comparison and shows IGST columns with 0 tax', () => {
    const items = ITEMS.map((i) => ({ ...i, taxRatePct: 0 }));
    const order = legacyExclusiveOrder(false, items);
    expect(order.tax).toBe(0);
    const doc = buildInvoiceDocument(input(order, { address: ADDRESS_MH }));
    expect(doc.showInter).toBe(true);
    expect(doc.showIntra).toBe(false);
    expectReconciles(order, doc);
    doc.lines.forEach((l) => expect(l.igst).toBe(0));
    const html = renderInvoiceHtml(doc);
    expect(html).toContain('<th>IGST %</th>');
    expect(html).not.toContain('CGST');
  });

  it('zero-tax intra-state order shows CGST + SGST columns', () => {
    const items = ITEMS.map((i) => ({ ...i, taxRatePct: 0 }));
    const doc = buildInvoiceDocument(input(legacyExclusiveOrder(true, items)));
    expect(doc.showIntra).toBe(true);
    expect(doc.showInter).toBe(false);
  });

  it('zero-discount order: no discount row, every line discount is 0, reconciles exactly', () => {
    const order = { ...legacyExclusiveOrder(true), couponCode: null };
    const b = legacyExclusiveBreakup(ITEMS, true, 4900, 0, 0);
    const noDiscount: InvoiceOrder = {
      ...order,
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
    expect(noDiscount.discount).toBe(0);
    const doc = buildInvoiceDocument(input(noDiscount));
    expectReconciles(noDiscount, doc);
    doc.lines.forEach((l) => {
      expect(l.discount).toBe(0);
      expect(l.taxable).toBe(l.gross);
    });
    const html = renderInvoiceHtml(doc);
    expect(html).not.toContain('Less: Discount');
    expect(html).not.toContain('COD fee');
  });

  it('single-line order: the line carries the full stored discount, taxable and tax', () => {
    const order = legacyExclusiveOrder(true, [ITEMS[1]!]);
    const doc = buildInvoiceDocument(input(order));
    expectReconciles(order, doc);
    const [l] = doc.lines;
    expect(doc.lines).toHaveLength(1);
    expect(l!.discount).toBe(order.discount);
    expect(l!.cgst).toBe(order.cgst);
    expect(l!.sgst).toBe(order.sgst);
    expect(l!.taxable).toBe(order.subtotal - order.discount);
    expect(l!.total + order.shipping + order.codFee).toBe(order.grandTotal);
    expect(doc.hsn).toHaveLength(1);
  });

  it('groups lines with the same HSN + rate into one HSN summary row', () => {
    const doc = buildInvoiceDocument(input(legacyExclusiveOrder(true)));
    expect(doc.hsn.map((h) => `${h.hsn}|${h.taxRatePct}`)).toEqual(['1006|5', '0902|18']);
    const rice = doc.hsn[0]!;
    expect(rice.taxable).toBe(doc.lines[0]!.taxable + doc.lines[2]!.taxable);
    expect(rice.totalTax).toBe(rice.cgst + rice.sgst + rice.igst);
  });

  it("shows '-' for a missing HSN code", () => {
    const doc = buildInvoiceDocument(input(legacyExclusiveOrder(true), { hsnByVariant: new Map() }));
    expect(doc.lines.every((l) => l.hsn === '-')).toBe(true);
  });

  it('shows a round-off row only when the stored grand total differs from the computed sum', () => {
    const consistent = renderInvoiceHtml(buildInvoiceDocument(input(legacyExclusiveOrder(true))));
    expect(consistent).not.toContain('Round-off');

    const order = legacyExclusiveOrder(true);
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
    const order = { ...legacyExclusiveOrder(true) };
    const doc = buildInvoiceDocument(input(order));
    const html = renderInvoiceHtml(doc);
    expect(doc.totals.amountInWords).toMatch(/^Rupees /);
    expect(html).toContain(doc.totals.amountInWords);
    expect(html).toContain('GRAND TOTAL');
  });
});

describe('buildInvoiceDocument — orders priced by the GST-inclusive engine', () => {
  const lineTax = (doc: ReturnType<typeof buildInvoiceDocument>, key: 'cgst' | 'sgst' | 'igst') =>
    sum(doc.lines.map((l) => l[key]));

  it('(a) intra-state mixed 5%/18% cart with coupon, shipping and COD reconciles to the stored snapshot', () => {
    const order = engineOrder(true);
    expect(order.tax).toBe(11245);
    expect(order.cgst).toBe(5622);
    expect(order.sgst).toBe(5623);
    expect(order.grandTotal).toBe(180317);
    const doc = buildInvoiceDocument(input(order));
    expectReconciles(order, doc);
    expect(doc.totals.pricesIncludeGst).toBe(true);
    expect(doc.totals.grandTotal).toBe(order.grandTotal);
    expect(lineTax(doc, 'cgst')).toBe(order.cgst);
    expect(lineTax(doc, 'sgst')).toBe(order.sgst);
    expect(lineTax(doc, 'igst')).toBe(0);
    expect(doc.totals.taxableTotal).toBe(160272);
    doc.lines.forEach((l) => expect(l.total).toBe(l.gross - l.discount));
    expect(renderInvoiceHtml(doc)).not.toContain('Round-off');
  });

  it('(b) inter-state engine order shows IGST only and reconciles', () => {
    const order = engineOrder(false);
    const doc = buildInvoiceDocument(input(order, { address: ADDRESS_MH }));
    expect(doc.showInter).toBe(true);
    expect(lineTax(doc, 'igst')).toBe(11245);
    expectReconciles(order, doc);
    expect(doc.totals.pricesIncludeGst).toBe(true);
  });

  it('(c) ₹9,588 @5% single line: invoice total ₹9,588 with ₹456.57 GST extracted', () => {
    const rice = [{ ...ITEMS[0]!, unitPrice: 958800, quantity: 1 }];
    const opts = { shipping: 0, codFee: 0, flatCoupon: 0 };
    const intra = engineOrder(true, rice, opts);
    const doc = buildInvoiceDocument(input(intra));
    expectReconciles(intra, doc);
    expect(doc.totals.taxableTotal).toBe(913143);
    expect(doc.totals.grandTotal).toBe(958800);
    expect(doc.lines[0]!.cgst).toBe(22828);
    expect(doc.lines[0]!.sgst).toBe(22829);

    const inter = engineOrder(false, rice, opts);
    const idoc = buildInvoiceDocument(input(inter, { address: ADDRESS_MH }));
    expectReconciles(inter, idoc);
    expect(idoc.lines[0]!.igst).toBe(45657);
    expect(idoc.totals.grandTotal).toBe(958800);
  });

  it('(d) a 0% line in an engine order carries no tax and the invoice reconciles', () => {
    const items = [
      { variantId: 'v-1', title: 'Fresh Milk 1L', sku: 'MILK-1L', unitPrice: 6800, quantity: 2, taxRatePct: 0 },
      { variantId: 'v-2', title: 'Green Tea 100g', sku: 'TEA-100', unitPrice: 29900, quantity: 1, taxRatePct: 18 },
    ];
    for (const sameState of [true, false]) {
      const order = engineOrder(sameState, items);
      expect(order.tax).toBeGreaterThan(0);
      const doc = buildInvoiceDocument(input(order, { address: sameState ? ADDRESS_KA : ADDRESS_MH }));
      expectReconciles(order, doc);
      const milk = doc.lines[0]!;
      expect(milk.cgst + milk.sgst + milk.igst).toBe(0);
    }
  });

  /** Each invoice line carries exactly the GST checkout extracted for it. */
  function expectLinesMatchEngine(order: InvoiceOrder, doc: ReturnType<typeof buildInvoiceDocument>) {
    const engine = inclusiveLineTaxes(toLines(order.items as Item[]), paise(order.discount));
    doc.lines.forEach((l, i) => {
      expect(l.discount).toBe(engine[i]!.discount);
      expect(l.cgst + l.sgst + l.igst).toBe(engine[i]!.tax);
      expect(Math.abs(l.cgst - l.sgst)).toBeLessThanOrEqual(1);
      if (order.igst > 0) expect(l.cgst + l.sgst).toBe(0);
      else expect(l.igst).toBe(0);
      // printed taxable x printed rate reproduces the printed GST (± rounding)
      expect(Math.abs((l.taxable * l.taxRatePct) / 100 - (l.cgst + l.sgst + l.igst))).toBeLessThanOrEqual(1);
    });
  }

  it('(e) per-line GST equals the engine per-line extraction on the mixed 5%/18% cart (intra + inter)', () => {
    for (const sameState of [true, false]) {
      const order = engineOrder(sameState);
      const doc = buildInvoiceDocument(input(order, { address: sameState ? ADDRESS_KA : ADDRESS_MH }));
      expectReconciles(order, doc);
      expectLinesMatchEngine(order, doc);
      // E4 pins: nets 97898 / 29331 / 44288 -> extracted GST 4662 / 4474 / 2109
      expect(doc.lines.map((l) => l.cgst + l.sgst + l.igst)).toEqual([4662, 4474, 2109]);
      expect(doc.lines.map((l) => l.taxable)).toEqual([93236, 24857, 42179]);
      // HSN summary: 5% group = rice + chai, 18% group = tea
      const byRate = (r: number) => doc.hsn.filter((h) => h.taxRatePct === r);
      expect(sum(byRate(5).map((h) => h.totalTax))).toBe(4662 + 2109);
      expect(sum(byRate(18).map((h) => h.totalTax))).toBe(4474);
    }
  });

  it('(f) per-line GST equals the engine extraction for random mixed-rate engine orders', () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 8) % n;
    };
    const RATES = [0, 5, 12, 18, 28];
    for (let k = 0; k < 300; k++) {
      const items: Item[] = Array.from({ length: 1 + rnd(5) }, (_, j) => ({
        variantId: `v-${j}`,
        title: `Item ${j}`,
        sku: `SKU-${j}`,
        unitPrice: 1 + rnd(200000),
        quantity: 1 + rnd(4),
        taxRatePct: RATES[rnd(RATES.length)]!,
      }));
      const sameState = rnd(2) === 0;
      const order = engineOrder(sameState, items, { shipping: rnd(2) * 4900, codFee: rnd(2) * 3900, flatCoupon: rnd(5000) });
      const doc = buildInvoiceDocument(input(order, { address: sameState ? ADDRESS_KA : ADDRESS_MH }));
      expectReconciles(order, doc);
      expectLinesMatchEngine(order, doc);
      // invoice and web (shared isGstInclusiveSnapshot) agree on the mode
      expect(doc.totals.pricesIncludeGst).toBe(order.tax > 0 && isGstInclusiveSnapshot(order));
    }
  });

  it('(h) an odd snapshot the shared rule calls inclusive but that does not reconcile as inclusive keeps the pro-rata split', () => {
    const order = legacyExclusiveOrder(true);
    const odd = { ...order, tax: order.tax - 40, cgst: order.cgst - 20, sgst: order.sgst - 20 };
    expect(isGstInclusiveSnapshot(odd)).toBe(true);
    const doc = buildInvoiceDocument(input(odd));
    expect(doc.totals.pricesIncludeGst).toBe(false);
    expect(sum(doc.lines.map((l) => l.total)) + odd.shipping + odd.codFee).toBe(odd.grandTotal);
  });

  it('(g) legacy GST-exclusive orders keep the net x rate split (unchanged)', () => {
    const order = legacyExclusiveOrder(true);
    const doc = buildInvoiceDocument(input(order));
    expect(doc.totals.pricesIncludeGst).toBe(false);
    const weights = doc.lines.map((l) => (l.gross - l.discount) * l.taxRatePct * 100);
    const wSum = sum(weights);
    doc.lines.slice(0, -1).forEach((l, i) => {
      expect(l.cgst).toBe(Math.floor((order.cgst * weights[i]!) / wSum));
    });
  });
});

describe('renderInvoiceHtml — content and escaping', () => {
  it('escapes user-entered text everywhere', () => {
    const order = legacyExclusiveOrder(true, [{ ...ITEMS[0]!, title: '<script>alert(1)</script>' }]);
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
      buildInvoiceDocument(input(legacyExclusiveOrder(true), { seller: { ...SELLER, gstin: null, pan: null } })),
    );
    expect(html).toContain('GSTIN:</span> Not registered');
    expect(html).not.toContain('PAN:');
    expect(html).not.toContain('GSTIN-UNSET');
  });

  it('prints GSTIN and PAN when registered', () => {
    const html = renderInvoiceHtml(buildInvoiceDocument(input(legacyExclusiveOrder(true))));
    expect(html).toContain('29ABCDE1234F1Z5');
    expect(html).toContain('PAN:</span> ABCDE1234F');
  });

  it('includes the required fixed texts, meta and parties', () => {
    const order = legacyExclusiveOrder(true);
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
    const doc = buildInvoiceDocument(input(legacyExclusiveOrder(true), { address: null, customer: null }));
    expect(doc.placeOfSupply).toBe('-');
    expect(doc.billTo.name).toBeNull();
    const html = renderInvoiceHtml(doc);
    expect(html).toContain('Bill To');
    expect(html).toContain('<div class="party-name">-</div>');
  });

  it('only embeds an http(s) logo URL', () => {
    const ok = renderInvoiceHtml(
      buildInvoiceDocument(input(legacyExclusiveOrder(true), { seller: { ...SELLER, logoUrl: 'https://cdn.x/logo.png' } })),
    );
    expect(ok).toContain('<img src="https://cdn.x/logo.png"');
    const bad = renderInvoiceHtml(
      buildInvoiceDocument(input(legacyExclusiveOrder(true), { seller: { ...SELLER, logoUrl: 'javascript:alert(1)' } })),
    );
    expect(bad).not.toContain('<img');
    const embedded = renderInvoiceHtml(
      buildInvoiceDocument(
        input(legacyExclusiveOrder(true), {
          seller: { ...SELLER, logoUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
        }),
      ),
    );
    expect(embedded).toContain('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="');
    const nonImageData = renderInvoiceHtml(
      buildInvoiceDocument(
        input(legacyExclusiveOrder(true), { seller: { ...SELLER, logoUrl: 'data:text/html;base64,PGI+' } }),
      ),
    );
    expect(nonImageData).not.toContain('<img');
    expect(bad).not.toContain('javascript:');
  });
});

describe('buildInvoiceDocument — an order with a special-offer item and a coupon', () => {
  const OFFER_ITEMS = [
    { variantId: 'v-1', title: 'Basmati Rice 5kg', sku: 'RICE-5KG', unitPrice: 49900, quantity: 4, taxRatePct: 5, offerId: null as string | null, offerName: null as string | null },
    { variantId: 'v-2', title: 'Sugar 1 kg', sku: 'SUGAR-1', unitPrice: 2900, quantity: 1, taxRatePct: 5, offerId: 'o1' as string | null, offerName: 'Sugar at 29' as string | null },
  ];
  function offerOrder(sameState: boolean): InvoiceOrder {
    const b = computeTotals({
      lines: OFFER_ITEMS.map((i) => ({ unitPrice: paise(i.unitPrice), quantity: i.quantity, taxRatePct: i.taxRatePct, noDiscount: i.offerId != null })),
      sameState,
      shipping: paise(0),
      codFee: paise(0),
      coupon: { kind: 'percent', value: 10 },
    });
    return {
      id: 'c1b2c3d4-0000-4000-8000-000000000009',
      createdAt: new Date('2025-03-14T10:00:00Z'),
      couponCode: 'TEN',
      subtotal: b.subtotal,
      discount: b.discount,
      shipping: b.shipping,
      codFee: b.codFee,
      tax: b.tax,
      cgst: b.gst.cgst,
      sgst: b.gst.sgst,
      igst: b.gst.igst,
      grandTotal: b.grandTotal,
      items: OFFER_ITEMS,
      payments: [{ provider: 'cod', status: 'created', method: null, createdAt: new Date('2025-03-14T10:00:00Z') }],
    };
  }

  it('the coupon discount is shared over the other items only, and the invoice still reconciles exactly', () => {
    const order = offerOrder(true);
    expect(order.discount).toBe(19960); // 10% of 4 x 499, not of the offer item
    const doc = buildInvoiceDocument(input(order, { hsnByVariant: new Map([['v-1', '1006'], ['v-2', '1701']]) }));
    expectReconciles(order, doc);
    expect(doc.lines[1]).toMatchObject({ discount: 0, total: 2900 });
    expect(doc.lines[0]!.discount).toBe(19960);
  });

  it('reconciles for an inter-state order too', () => {
    const order = offerOrder(false);
    expectReconciles(order, buildInvoiceDocument(input(order, { hsnByVariant: new Map([['v-1', '1006'], ['v-2', '1701']]), address: ADDRESS_MH })));
  });
});
