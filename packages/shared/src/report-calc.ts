import { isValidDateKey, istDateKey as istKeyOfMs } from './festivals';
import { paise } from './money';
import { inclusiveLineTaxes } from './pricing';

/**
 * Pure maths behind the admin reports (no I/O). All money is integer paise. Dates are India calendar
 * days (IST, UTC+05:30): a "day" in a report is the shop's day, not the server's.
 */

// ---------------------------------------------------------------------------
// India dates and ranges
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Longest span one report may cover. */
export const MAX_REPORT_DAYS = 366;
export const DEFAULT_REPORT_DAYS = 30;

/** The India calendar day of an instant. */
export function istDay(d: Date): string {
  return istKeyOfMs(d.getTime());
}

/** First instant of an India day. */
export function istDayStart(key: string): Date {
  return new Date(`${key}T00:00:00+05:30`);
}

/** Last millisecond of an India day. */
export function istDayEnd(key: string): Date {
  return new Date(istDayStart(key).getTime() + DAY_MS - 1);
}

export function addDays(key: string, n: number): string {
  return new Date(new Date(`${key}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both included. */
export function eachDateKey(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to && out.length <= MAX_REPORT_DAYS + 1; k = addDays(k, 1)) out.push(k);
  return out;
}

export interface ReportRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

/**
 * Turns the asked-for days into a safe range: bad or missing days fall back to the last 30 days,
 * swapped days are put in order, the future is cut at today, and the span is capped.
 */
export function resolveReportRange(from: unknown, to: unknown, now: Date = new Date()): ReportRange {
  const today = istDay(now);
  let toKey = isValidDateKey(to) ? to : today;
  if (toKey > today) toKey = today;
  let fromKey = isValidDateKey(from) ? from : addDays(toKey, -(DEFAULT_REPORT_DAYS - 1));
  if (fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];
  const earliest = addDays(toKey, -(MAX_REPORT_DAYS - 1));
  if (fromKey < earliest) fromKey = earliest;
  return { from: fromKey, to: toKey, start: istDayStart(fromKey), end: istDayEnd(toKey) };
}

export const RANGE_PRESETS = ['today', 'yesterday', '7d', '30d', 'this-month', 'last-month'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** The days a quick filter stands for (always ends today or earlier). */
export function presetRange(preset: RangePreset, now: Date = new Date()): { from: string; to: string } {
  const today = istDay(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'this-month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'last-month': {
      const firstThis = `${today.slice(0, 7)}-01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
  }
}

// ---------------------------------------------------------------------------
// Order lines
// ---------------------------------------------------------------------------

export interface ReportItemInput {
  id: string;
  variantId: string;
  title: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  taxRatePct: number;
  /** Cost saved on the order item when it was placed; null for older orders. */
  costPrice: number | null;
}

export interface ReportOrderInput {
  id: string;
  createdAt: Date;
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  tax: number;
  grandTotal: number;
  items: ReportItemInput[];
}

export interface ReportLine {
  orderId: string;
  itemId: string;
  variantId: string;
  title: string;
  sku: string;
  dateKey: string;
  quantity: number;
  returnedQty: number;
  /** unitPrice x quantity. */
  gross: number;
  /** This line's share of the order discount. */
  discount: number;
  /** What the customer paid for the line, GST included. */
  net: number;
  /** GST contained in `net`. */
  tax: number;
  /** `net` without GST: the shop's sales for this line. */
  netExTax: number;
  /** Cost of one unit, or null when no cost is known. */
  costUnit: number | null;
  /** True when the cost is today's cost price (the order did not save one). */
  costEstimated: boolean;
}

/**
 * Splits one order into report lines. The order discount is shared across lines and GST is taken out
 * of each line exactly as checkout did (`inclusiveLineTaxes`), so the lines add up to the order.
 * `currentCost` is the variant's cost price today, used only when the item saved none.
 */
export function buildReportLines(
  order: ReportOrderInput,
  currentCost: ReadonlyMap<string, number | null>,
  returnedQty: ReadonlyMap<string, number>,
): ReportLine[] {
  const taxes = inclusiveLineTaxes(
    order.items.map((i) => ({ unitPrice: paise(i.unitPrice), quantity: i.quantity, taxRatePct: i.taxRatePct })),
    paise(Math.min(order.discount, order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0))),
  );
  return order.items.map((item, idx) => {
    const t = taxes[idx]!;
    const snapshot = item.costPrice;
    const fallback = currentCost.get(item.variantId) ?? null;
    const costUnit = snapshot ?? fallback;
    return {
      orderId: order.id,
      itemId: item.id,
      variantId: item.variantId,
      title: item.title,
      sku: item.sku,
      dateKey: istDay(order.createdAt),
      quantity: item.quantity,
      returnedQty: Math.min(item.quantity, Math.max(0, returnedQty.get(item.id) ?? 0)),
      gross: t.gross,
      discount: t.discount,
      net: t.net,
      tax: t.tax,
      netExTax: t.net - t.tax,
      costUnit,
      costEstimated: snapshot === null && fallback !== null,
    };
  });
}

/** Sales of the line that were refunded through returns (without GST). */
export function refundedExTax(line: ReportLine): number {
  return line.quantity > 0 ? Math.round((line.netExTax * line.returnedQty) / line.quantity) : 0;
}

/** Cost of the units kept by customers (returned units go back on the shelf). */
export function lineCogs(line: ReportLine): number {
  return line.costUnit === null ? 0 : line.costUnit * (line.quantity - line.returnedQty);
}

// ---------------------------------------------------------------------------
// Profit and loss
// ---------------------------------------------------------------------------

export interface ProfitLoss {
  /** Item sales without GST, after discounts. */
  itemSales: number;
  /** Delivery and COD fees charged. */
  feeIncome: number;
  refunds: number;
  /** itemSales + feeIncome - refunds. */
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** Gross profit as a percent of revenue, two decimals; null when there is no revenue. */
  marginPct: number | null;
  /** Lines sold with no cost known: their profit is overstated. */
  linesMissingCost: number;
  /** Sales (after refunds) on those lines. */
  salesMissingCost: number;
  /** Lines whose cost is today's cost price, not the one at order time. */
  linesEstimatedCost: number;
}

export function marginPct(profit: number, revenue: number): number | null {
  return revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : null;
}

export function profitLoss(orders: ReadonlyArray<{ shipping: number; codFee: number }>, lines: readonly ReportLine[]): ProfitLoss {
  let itemSales = 0;
  let refunds = 0;
  let cogs = 0;
  let linesMissingCost = 0;
  let salesMissingCost = 0;
  let linesEstimatedCost = 0;
  for (const l of lines) {
    const refund = refundedExTax(l);
    itemSales += l.netExTax;
    refunds += refund;
    cogs += lineCogs(l);
    if (l.costUnit === null) {
      linesMissingCost += 1;
      salesMissingCost += l.netExTax - refund;
    } else if (l.costEstimated) {
      linesEstimatedCost += 1;
    }
  }
  const feeIncome = orders.reduce((s, o) => s + o.shipping + o.codFee, 0);
  const revenue = itemSales + feeIncome - refunds;
  const grossProfit = revenue - cogs;
  return {
    itemSales,
    feeIncome,
    refunds,
    revenue,
    cogs,
    grossProfit,
    marginPct: marginPct(grossProfit, revenue),
    linesMissingCost,
    salesMissingCost,
    linesEstimatedCost,
  };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export interface GroupRow {
  key: string;
  label: string;
  units: number;
  returnedUnits: number;
  orders: number;
  /** Sales without GST, after discounts, before refunds. */
  sales: number;
  refunds: number;
  cogs: number;
  profit: number;
  linesMissingCost: number;
  linesEstimatedCost: number;
}

/** Groups lines by a key. `orders` counts distinct orders in the group. */
export function groupLines(
  lines: readonly ReportLine[],
  keyOf: (l: ReportLine) => { key: string; label: string },
): GroupRow[] {
  const map = new Map<string, GroupRow & { orderIds: Set<string> }>();
  for (const l of lines) {
    const { key, label } = keyOf(l);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        label,
        units: 0,
        returnedUnits: 0,
        orders: 0,
        sales: 0,
        refunds: 0,
        cogs: 0,
        profit: 0,
        linesMissingCost: 0,
        linesEstimatedCost: 0,
        orderIds: new Set(),
      };
      map.set(key, g);
    }
    const refund = refundedExTax(l);
    g.units += l.quantity - l.returnedQty;
    g.returnedUnits += l.returnedQty;
    g.sales += l.netExTax;
    g.refunds += refund;
    g.cogs += lineCogs(l);
    g.profit += l.netExTax - refund - lineCogs(l);
    if (l.costUnit === null) g.linesMissingCost += 1;
    else if (l.costEstimated) g.linesEstimatedCost += 1;
    g.orderIds.add(l.orderId);
  }
  return [...map.values()].map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size }));
}

/** How trustworthy a group's cost is. */
export function costStatus(g: Pick<GroupRow, 'linesMissingCost' | 'linesEstimatedCost'>): 'ok' | 'estimated' | 'missing' {
  if (g.linesMissingCost > 0) return 'missing';
  return g.linesEstimatedCost > 0 ? 'estimated' : 'ok';
}
