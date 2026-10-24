import fc from 'fast-check';
import {
  MAX_REPORT_DAYS,
  addDays,
  buildReportLines,
  costStatus,
  eachDateKey,
  groupLines,
  istDay,
  istDayEnd,
  istDayStart,
  lineCogs,
  marginPct,
  presetRange,
  profitLoss,
  refundedExTax,
  resolveReportRange,
  type ReportItemInput,
  type ReportOrderInput,
} from './report-calc';
import { isValidDateKey } from './festivals';
import { inclusiveLineTaxes } from './pricing';
import { paise } from './money';

const NOW = new Date('2026-10-24T10:00:00Z'); // 15:30 IST on 2026-10-24

describe('India dates', () => {
  it('uses the India day, not the UTC day', () => {
    expect(istDay(new Date('2026-10-23T18:29:59Z'))).toBe('2026-10-23');
    expect(istDay(new Date('2026-10-23T18:30:00Z'))).toBe('2026-10-24');
  });

  it('day start and end are 24 hours apart, minus one millisecond', () => {
    expect(istDayEnd('2026-10-24').getTime() - istDayStart('2026-10-24').getTime()).toBe(86_400_000 - 1);
    expect(istDayStart('2026-10-24').toISOString()).toBe('2026-10-23T18:30:00.000Z');
  });

  it('accepts only real calendar days', () => {
    expect(isValidDateKey('2026-02-28')).toBe(true);
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-2-3')).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
  });

  it('lists every day of a range', () => {
    expect(eachDateKey('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });
});

describe('resolveReportRange', () => {
  it('defaults to the last 30 days ending today', () => {
    const r = resolveReportRange(undefined, undefined, NOW);
    expect(r.to).toBe('2026-10-24');
    expect(r.from).toBe('2026-09-25');
  });

  it('puts swapped days in order and cuts the future at today', () => {
    expect(resolveReportRange('2026-10-20', '2026-10-10', NOW)).toMatchObject({ from: '2026-10-10', to: '2026-10-20' });
    expect(resolveReportRange('2026-10-20', '2030-01-01', NOW).to).toBe('2026-10-24');
  });

  it('falls back on bad days and caps the span', () => {
    expect(resolveReportRange('nope', '2026-10-24', NOW).from).toBe('2026-09-25');
    const long = resolveReportRange('2000-01-01', '2026-10-24', NOW);
    expect(eachDateKey(long.from, long.to)).toHaveLength(MAX_REPORT_DAYS);
  });

  it('PBT: always ordered, never in the future, never longer than the cap', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const r = resolveReportRange(a, b, NOW);
        expect(r.from <= r.to).toBe(true);
        expect(r.to <= '2026-10-24').toBe(true);
        expect(eachDateKey(r.from, r.to).length).toBeLessThanOrEqual(MAX_REPORT_DAYS);
        expect(r.start.getTime()).toBeLessThan(r.end.getTime());
      }),
    );
  });
});

describe('presetRange', () => {
  it('works out the quick filters', () => {
    expect(presetRange('today', NOW)).toEqual({ from: '2026-10-24', to: '2026-10-24' });
    expect(presetRange('yesterday', NOW)).toEqual({ from: '2026-10-23', to: '2026-10-23' });
    expect(presetRange('7d', NOW)).toEqual({ from: '2026-10-18', to: '2026-10-24' });
    expect(presetRange('30d', NOW)).toEqual({ from: '2026-09-25', to: '2026-10-24' });
    expect(presetRange('this-month', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-24' });
    expect(presetRange('last-month', NOW)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('last month crosses the year end', () => {
    expect(presetRange('last-month', new Date('2027-01-10T10:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('addDays handles month ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

const item = (over: Partial<ReportItemInput> = {}): ReportItemInput => ({
  id: 'i1',
  variantId: 'v1',
  title: 'Atta 5kg',
  sku: 'ATTA-5',
  unitPrice: 25_000,
  quantity: 2,
  taxRatePct: 5,
  costPrice: 20_000,
  ...over,
});

const order = (items: ReportItemInput[], over: Partial<ReportOrderInput> = {}): ReportOrderInput => {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discount = over.discount ?? 0;
  const tax = inclusiveLineTaxes(
    items.map((i) => ({ unitPrice: paise(i.unitPrice), quantity: i.quantity, taxRatePct: i.taxRatePct })),
    paise(discount),
  ).reduce((s, t) => s + t.tax, 0);
  const shipping = over.shipping ?? 0;
  const codFee = over.codFee ?? 0;
  return {
    id: 'o1',
    createdAt: new Date('2026-10-23T18:40:00Z'),
    subtotal,
    discount,
    shipping,
    codFee,
    tax,
    grandTotal: subtotal - discount + shipping + codFee,
    items,
    ...over,
  };
};

const noCost = new Map<string, number | null>();
const noReturns = new Map<string, number>();

describe('buildReportLines', () => {
  it('takes GST out of the price the customer paid', () => {
    const [l] = buildReportLines(order([item()]), noCost, noReturns);
    expect(l).toMatchObject({ gross: 50_000, discount: 0, net: 50_000, tax: 2_381, netExTax: 47_619, dateKey: '2026-10-24' });
  });

  it('uses the saved cost, else today\'s cost marked as an estimate, else nothing', () => {
    const saved = buildReportLines(order([item()]), new Map([['v1', 99]]), noReturns)[0]!;
    expect(saved).toMatchObject({ costUnit: 20_000, costEstimated: false });
    const estimated = buildReportLines(order([item({ costPrice: null })]), new Map([['v1', 18_000]]), noReturns)[0]!;
    expect(estimated).toMatchObject({ costUnit: 18_000, costEstimated: true });
    const missing = buildReportLines(order([item({ costPrice: null })]), noCost, noReturns)[0]!;
    expect(missing).toMatchObject({ costUnit: null, costEstimated: false });
  });

  it('never counts more returned units than were sold', () => {
    const [l] = buildReportLines(order([item()]), noCost, new Map([['i1', 9]]));
    expect(l!.returnedQty).toBe(2);
  });

  it('PBT: lines add up to the order (net = subtotal - discount; sales + fees = total - tax)', () => {
    const itemArb = fc.record({
      unitPrice: fc.integer({ min: 100, max: 500_000 }),
      quantity: fc.integer({ min: 1, max: 20 }),
      taxRatePct: fc.constantFrom(0, 5, 12, 18, 28),
    });
    fc.assert(
      fc.property(
        fc.array(itemArb, { minLength: 1, maxLength: 6 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        (raw, discountShare, shipping, codFee) => {
          const items = raw.map((r, i) => item({ id: `i${i}`, variantId: `v${i}`, ...r }));
          const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
          const discount = Math.floor(subtotal * discountShare);
          const o = order(items, { discount, shipping, codFee });
          const lines = buildReportLines(o, noCost, noReturns);
          expect(lines.reduce((s, l) => s + l.net, 0)).toBe(subtotal - discount);
          expect(lines.reduce((s, l) => s + l.tax, 0)).toBe(o.tax);
          expect(lines.reduce((s, l) => s + l.netExTax, 0) + shipping + codFee).toBe(o.grandTotal - o.tax);
          for (const l of lines) expect(l.netExTax).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

describe('profit and loss', () => {
  it('sales + fees - refunds - cost = gross profit', () => {
    const o = order([item({ quantity: 4 })], { shipping: 4_000, codFee: 2_000 });
    const lines = buildReportLines(o, noCost, new Map([['i1', 1]]));
    const l = lines[0]!;
    expect(refundedExTax(l)).toBe(Math.round((l.netExTax * 1) / 4));
    expect(lineCogs(l)).toBe(20_000 * 3);
    const pl = profitLoss([o], lines);
    expect(pl.itemSales).toBe(l.netExTax);
    expect(pl.feeIncome).toBe(6_000);
    expect(pl.revenue).toBe(pl.itemSales + 6_000 - pl.refunds);
    expect(pl.grossProfit).toBe(pl.revenue - 60_000);
    expect(pl.marginPct).toBe(marginPct(pl.grossProfit, pl.revenue));
    expect(pl.linesMissingCost).toBe(0);
  });

  it('flags lines with no cost instead of hiding them', () => {
    const o = order([item({ costPrice: null })]);
    const pl = profitLoss([o], buildReportLines(o, noCost, noReturns));
    expect(pl.linesMissingCost).toBe(1);
    expect(pl.salesMissingCost).toBe(pl.itemSales);
    expect(pl.cogs).toBe(0);
  });

  it('counts estimated costs separately', () => {
    const o = order([item({ costPrice: null })]);
    const pl = profitLoss([o], buildReportLines(o, new Map([['v1', 18_000]]), noReturns));
    expect(pl).toMatchObject({ linesMissingCost: 0, linesEstimatedCost: 1, cogs: 36_000 });
  });

  it('has no margin without revenue', () => {
    expect(marginPct(0, 0)).toBeNull();
    expect(profitLoss([], [])).toMatchObject({ revenue: 0, grossProfit: 0, marginPct: null });
  });

  it('PBT: the totals equal the sum over groups (product rows add up to the report)', () => {
    const itemArb = fc.record({
      unitPrice: fc.integer({ min: 100, max: 100_000 }),
      quantity: fc.integer({ min: 1, max: 10 }),
      costPrice: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }),
      v: fc.integer({ min: 0, max: 3 }),
    });
    fc.assert(
      fc.property(fc.array(itemArb, { minLength: 1, maxLength: 8 }), (raw) => {
        const items = raw.map((r, i) =>
          item({ id: `i${i}`, variantId: `v${r.v}`, unitPrice: r.unitPrice, quantity: r.quantity, costPrice: r.costPrice }),
        );
        const o = order(items);
        const lines = buildReportLines(o, noCost, noReturns);
        const groups = groupLines(lines, (l) => ({ key: l.variantId, label: l.variantId }));
        const pl = profitLoss([o], lines);
        expect(groups.reduce((s, g) => s + g.sales, 0)).toBe(pl.itemSales);
        expect(groups.reduce((s, g) => s + g.cogs, 0)).toBe(pl.cogs);
        expect(groups.reduce((s, g) => s + g.profit, 0)).toBe(pl.itemSales - pl.refunds - pl.cogs);
        expect(groups.reduce((s, g) => s + g.units, 0)).toBe(items.reduce((s, i) => s + i.quantity, 0));
      }),
    );
  });
});

describe('groupLines / costStatus', () => {
  it('counts distinct orders per group and returned units', () => {
    const o1 = order([item({ id: 'a', quantity: 1 }), item({ id: 'b', quantity: 3 })]);
    const o2 = { ...order([item({ id: 'c', quantity: 2 })]), id: 'o2' };
    const lines = [...buildReportLines(o1, noCost, new Map([['b', 1]])), ...buildReportLines(o2, noCost, noReturns)];
    const [g] = groupLines(lines, () => ({ key: 'all', label: 'All' }));
    expect(g).toMatchObject({ orders: 2, units: 1 + 2 + 2, returnedUnits: 1 });
  });

  it('rates how trustworthy a cost is', () => {
    expect(costStatus({ linesMissingCost: 0, linesEstimatedCost: 0 })).toBe('ok');
    expect(costStatus({ linesMissingCost: 0, linesEstimatedCost: 2 })).toBe('estimated');
    expect(costStatus({ linesMissingCost: 1, linesEstimatedCost: 2 })).toBe('missing');
  });
});
