import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import {
  REPORT_IDS,
  SUPER_ADMIN_REPORTS,
  averageOrderValue,
  buildReportLines,
  costStatus,
  eachDateKey,
  groupLines,
  istDay,
  lineCogs,
  marginPct,
  profitLoss,
  refundedExTax,
  resolveReportRange,
  shortOrderId,
  toCsv,
  type GroupRow,
  type ReportCard,
  type ReportChart,
  type ReportId,
  type ReportLine,
  type ReportRange,
  type ReportResponse,
} from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Orders that count as sales: confirmed or later (not pending, cancelled or returned). */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.confirmed,
  OrderStatus.packed,
  OrderStatus.shipped,
  OrderStatus.out_for_delivery,
  OrderStatus.delivered,
];
/** A report never reads more orders than this; the admin is asked to pick a shorter period. */
export const MAX_REPORT_ORDERS = 20_000;
const ORDERS_PAGE_SIZE = 50;
const USER_ROWS = 500;

export interface ReportQuery {
  from?: string;
  to?: string;
  status?: string;
  page?: number;
}

interface VariantMeta {
  costPrice: number | null;
  productId: string;
  product: string;
  category: string;
  brand: string;
}

interface LoadedSales {
  range: ReportRange;
  orders: {
    id: string;
    customerId: string;
    createdAt: Date;
    subtotal: number;
    discount: number;
    shipping: number;
    codFee: number;
    tax: number;
    grandTotal: number;
  }[];
  lines: ReportLine[];
  meta: Map<string, VariantMeta>;
}

const money = (label: string, value: number, extra: Partial<ReportCard> = {}): ReportCard => ({
  label,
  value,
  kind: 'money',
  ...extra,
});
const count = (label: string, value: number, extra: Partial<ReportCard> = {}): ReportCard => ({
  label,
  value,
  kind: 'int',
  ...extra,
});

/** `2026-10-24 15:30` in India time. */
export function istStamp(d: Date): string {
  return new Date(d.getTime() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

function providerLabel(provider: string, method: string | null): string {
  if (provider === 'cod') return 'Cash on delivery';
  const base = provider === 'razorpay' ? 'Online' : 'Test payment';
  return method ? `${base} · ${method}` : base;
}

/**
 * Admin reports (Admin 11). Every report is built in the same shape (`ReportResponse`), so the admin
 * page and the CSV export read the same columns. Money is integer paise; days are India days.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Builds one report. `all` returns every row (CSV) instead of one page. */
  async build(id: string, q: ReportQuery, opts: { all?: boolean } = {}): Promise<ReportResponse> {
    if (!(REPORT_IDS as readonly string[]).includes(id)) throw new NotFoundException('Unknown report');
    const rid = id as ReportId;
    const range = resolveReportRange(q.from, q.to);
    switch (rid) {
      case 'sales':
        return this.sales(range);
      case 'orders':
        return this.ordersReport(range, q, opts.all === true);
      case 'users':
        return this.users(range);
      case 'products':
        return this.products(range);
      case 'categories':
        return this.byGroup(range, 'categories');
      case 'brands':
        return this.byGroup(range, 'brands');
      case 'best-sellers':
        return this.bestSellers(range);
      case 'payments':
        return this.payments(range);
      case 'profit-loss':
        return this.profitLossReport(range);
    }
  }

  /** The routes that show cost or profit are Super Admin only; the generic route must not serve them. */
  assertNotRestricted(id: string): void {
    if ((SUPER_ADMIN_REPORTS as readonly string[]).includes(id)) {
      throw new ForbiddenException('This report is for the Super Admin only');
    }
  }

  /** The CSV text of a report: header labels, money in rupees. */
  toCsv(report: ReportResponse): string {
    const labels = report.columns.map((c) => c.label);
    const rows = report.rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const c of report.columns) {
        const v = row[c.key] ?? null;
        out[c.label] = c.kind === 'money' && typeof v === 'number' ? (v / 100).toFixed(2) : v;
      }
      return out;
    });
    return toCsv(labels, rows);
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  private dateWhere(range: ReportRange) {
    return { createdAt: { gte: range.start, lte: range.end } };
  }

  /** Sales orders of the period with their lines (GST, discount share and cost worked out). */
  private async loadSales(range: ReportRange): Promise<LoadedSales> {
    const orders = await this.prisma.order.findMany({
      where: { ...this.dateWhere(range), status: { in: REVENUE_STATUSES } },
      select: {
        id: true,
        customerId: true,
        createdAt: true,
        subtotal: true,
        discount: true,
        shipping: true,
        codFee: true,
        tax: true,
        grandTotal: true,
        items: {
          select: {
            id: true,
            variantId: true,
            title: true,
            sku: true,
            unitPrice: true,
            quantity: true,
            taxRatePct: true,
            costPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_REPORT_ORDERS + 1,
    });
    if (orders.length > MAX_REPORT_ORDERS) {
      throw new BadRequestException(`More than ${MAX_REPORT_ORDERS} orders in this period. Pick a shorter period.`);
    }

    const variantIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId)))];
    const variants = variantIds.length
      ? await this.prisma.variant.findMany({
          where: { id: { in: variantIds } },
          select: {
            id: true,
            costPrice: true,
            product: {
              select: { id: true, title: true, category: { select: { name: true } }, brand: { select: { name: true } } },
            },
          },
        })
      : [];
    const meta = new Map<string, VariantMeta>(
      variants.map((v) => [
        v.id,
        {
          costPrice: v.costPrice,
          productId: v.product.id,
          product: v.product.title,
          category: v.product.category.name,
          brand: v.product.brand?.name ?? 'No brand',
        },
      ]),
    );

    // Units given back through refunded returns, per order item.
    const returned = await this.prisma.returnItem.findMany({
      where: { returnRequest: { status: 'refunded', order: { ...this.dateWhere(range), status: { in: REVENUE_STATUSES } } } },
      select: { orderItemId: true, quantity: true },
    });
    const returnedQty = new Map<string, number>();
    for (const r of returned) returnedQty.set(r.orderItemId, (returnedQty.get(r.orderItemId) ?? 0) + r.quantity);

    const currentCost = new Map<string, number | null>([...meta].map(([id, m]) => [id, m.costPrice]));
    const lines = orders.flatMap((o) => buildReportLines(o, currentCost, returnedQty));
    return { range, orders, lines, meta };
  }

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  private async sales(range: ReportRange): Promise<ReportResponse> {
    const { orders, lines } = await this.loadSales(range);
    const days = new Map(
      eachDateKey(range.from, range.to).map((d) => [
        d,
        { orders: 0, subtotal: 0, discount: 0, tax: 0, total: 0 },
      ]),
    );
    for (const o of orders) {
      const d = days.get(istDay(o.createdAt));
      if (!d) continue;
      d.orders += 1;
      d.subtotal += o.subtotal;
      d.discount += o.discount;
      d.tax += o.tax;
      d.total += o.grandTotal;
    }
    const sum = (f: (o: (typeof orders)[number]) => number) => orders.reduce((s, o) => s + f(o), 0);
    const total = sum((o) => o.grandTotal);
    const tax = sum((o) => o.tax);
    const refunds = lines.reduce((s, l) => s + refundedExTax(l), 0);

    const cancelled = await this.prisma.order.aggregate({
      where: { ...this.dateWhere(range), status: { in: [OrderStatus.cancelled, OrderStatus.returned] } },
      _count: true,
      _sum: { grandTotal: true },
    });

    return {
      id: 'sales',
      title: 'Basic sales report',
      range: { from: range.from, to: range.to },
      cards: [
        count('Orders', orders.length),
        money('Gross sales', sum((o) => o.subtotal), { hint: 'Item prices before discounts' }),
        money('Discounts', sum((o) => o.discount)),
        money('Delivery and COD fees', sum((o) => o.shipping + o.codFee)),
        money('GST collected', tax),
        money('Net sales (without GST)', total - tax, { tone: 'good' }),
        money('Total collected', total, { hint: 'What customers were charged' }),
        money('Average order', averageOrderValue(total, orders.length)),
        money('Refunded (without GST)', refunds, { tone: refunds > 0 ? 'warn' : undefined }),
        count('Cancelled or returned orders', cancelled._count),
        money('Cancelled or returned value', cancelled._sum.grandTotal ?? 0),
      ],
      chart: {
        title: 'Total collected per day',
        kind: 'money',
        points: [...days].map(([date, d]) => ({ label: date.slice(5), value: d.total, extra: d.orders })),
      },
      columns: [
        { key: 'date', label: 'Date', kind: 'date' },
        { key: 'orders', label: 'Orders', kind: 'int' },
        { key: 'gross', label: 'Gross sales', kind: 'money' },
        { key: 'discount', label: 'Discounts', kind: 'money' },
        { key: 'tax', label: 'GST', kind: 'money' },
        { key: 'net', label: 'Net sales', kind: 'money' },
        { key: 'total', label: 'Total collected', kind: 'money' },
        { key: 'aov', label: 'Average order', kind: 'money' },
      ],
      rows: [...days].map(([date, d]) => ({
        date,
        orders: d.orders,
        gross: d.subtotal,
        discount: d.discount,
        tax: d.tax,
        net: d.total - d.tax,
        total: d.total,
        aov: averageOrderValue(d.total, d.orders),
      })),
      notes: [
        'Counts orders that are confirmed or later. Pending, cancelled and returned orders are left out of the figures.',
        'Days are India days.',
      ],
    };
  }

  private async ordersReport(range: ReportRange, q: ReportQuery, all: boolean): Promise<ReportResponse> {
    const status = (Object.values(OrderStatus) as string[]).includes(q.status ?? '') ? (q.status as OrderStatus) : undefined;
    const where = { ...this.dateWhere(range), ...(status ? { status } : {}) };
    const page = Math.max(1, Math.trunc(q.page ?? 1));
    const paging: { skip?: number; take: number } = all
      ? { take: MAX_REPORT_ORDERS }
      : { skip: (page - 1) * ORDERS_PAGE_SIZE, take: ORDERS_PAGE_SIZE };

    const [byStatus, total, found] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: this.dateWhere(range),
        _count: true,
        _sum: { grandTotal: true },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          customerId: true,
          status: true,
          createdAt: true,
          subtotal: true,
          discount: true,
          shipping: true,
          codFee: true,
          tax: true,
          grandTotal: true,
          items: { select: { quantity: true } },
          payments: { select: { provider: true, status: true, method: true }, take: 1, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        ...paging,
      }),
    ]);

    const customerIds = [...new Set(found.map((o) => o.customerId))];
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(customers.map((c) => [c.id, c.name]));

    const statusCards: ReportCard[] = byStatus
      .filter((s) => s._count > 0)
      .map((s) => count(s.status.replace(/_/g, ' '), s._count, { tone: s.status === 'cancelled' ? 'bad' : undefined }));

    return {
      id: 'orders',
      title: 'Order report',
      range: { from: range.from, to: range.to },
      cards: [
        count(status ? `Orders (${status.replace(/_/g, ' ')})` : 'Orders', total),
        money('Order value', byStatus.filter((s) => !status || s.status === status).reduce((s, g) => s + (g._sum.grandTotal ?? 0), 0)),
        ...statusCards,
      ],
      chart: null,
      columns: [
        { key: 'order', label: 'Order', kind: 'text' },
        { key: 'date', label: 'Placed (India time)', kind: 'text' },
        { key: 'customer', label: 'Customer', kind: 'text' },
        { key: 'status', label: 'Status', kind: 'status' },
        { key: 'payment', label: 'Payment', kind: 'text' },
        { key: 'items', label: 'Items', kind: 'int' },
        { key: 'subtotal', label: 'Subtotal', kind: 'money' },
        { key: 'discount', label: 'Discount', kind: 'money' },
        { key: 'shipping', label: 'Delivery', kind: 'money' },
        { key: 'codFee', label: 'COD fee', kind: 'money' },
        { key: 'tax', label: 'GST', kind: 'money' },
        { key: 'total', label: 'Total', kind: 'money' },
      ],
      rows: found.map((o) => {
        const p = o.payments[0];
        return {
          order: shortOrderId(o.id),
          date: istStamp(o.createdAt),
          customer: names.get(o.customerId) ?? '',
          status: o.status,
          payment: p ? `${providerLabel(p.provider, p.method)} · ${p.status.replace(/_/g, ' ')}` : '',
          items: o.items.reduce((s, i) => s + i.quantity, 0),
          subtotal: o.subtotal,
          discount: o.discount,
          shipping: o.shipping,
          codFee: o.codFee,
          tax: o.tax,
          total: o.grandTotal,
        };
      }),
      ...(all ? {} : { page: { page, pageSize: ORDERS_PAGE_SIZE, total } }),
      notes: ['Shows orders of every status placed in the period, newest first.'],
    };
  }

  private async users(range: ReportRange): Promise<ReportResponse> {
    const { orders } = await this.loadSales(range);
    const perCustomer = new Map<string, { orders: number; spent: number; last: Date }>();
    for (const o of orders) {
      const c = perCustomer.get(o.customerId) ?? { orders: 0, spent: 0, last: o.createdAt };
      c.orders += 1;
      c.spent += o.grandTotal;
      if (o.createdAt > c.last) c.last = o.createdAt;
      perCustomer.set(o.customerId, c);
    }
    const top = [...perCustomer].sort((a, b) => b[1].spent - a[1].spent).slice(0, USER_ROWS);

    const [customers, signups, totalCustomers, blocked] = await Promise.all([
      top.length
        ? this.prisma.customer.findMany({
            where: { id: { in: top.map(([id]) => id) } },
            select: { id: true, name: true, phone: true, email: true, status: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.prisma.customer.findMany({ where: this.dateWhere(range), select: { createdAt: true }, take: 50_000 }),
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { status: 'blocked' } }),
    ]);
    const byId = new Map(customers.map((c) => [c.id, c]));
    const signupDays = new Map(eachDateKey(range.from, range.to).map((d) => [d, 0]));
    for (const s of signups) {
      const k = istDay(s.createdAt);
      if (signupDays.has(k)) signupDays.set(k, (signupDays.get(k) ?? 0) + 1);
    }
    const repeat = [...perCustomer.values()].filter((c) => c.orders > 1).length;

    return {
      id: 'users',
      title: 'User report',
      range: { from: range.from, to: range.to },
      cards: [
        count('All customers', totalCustomers),
        count('New sign-ups', signups.length, { tone: 'good' }),
        count('Customers who ordered', perCustomer.size),
        count('Repeat customers', repeat, { hint: 'Two or more orders in the period' }),
        count('Blocked customers', blocked, { tone: blocked > 0 ? 'warn' : undefined }),
      ],
      chart: {
        title: 'New sign-ups per day',
        kind: 'int',
        points: [...signupDays].map(([d, n]) => ({ label: d.slice(5), value: n })),
      },
      columns: [
        { key: 'name', label: 'Customer', kind: 'text' },
        { key: 'phone', label: 'Phone', kind: 'text' },
        { key: 'email', label: 'E-mail', kind: 'text' },
        { key: 'orders', label: 'Orders', kind: 'int' },
        { key: 'spent', label: 'Spent', kind: 'money' },
        { key: 'aov', label: 'Average order', kind: 'money' },
        { key: 'last', label: 'Last order', kind: 'text' },
        { key: 'joined', label: 'Joined', kind: 'date' },
        { key: 'status', label: 'Status', kind: 'status' },
      ],
      rows: top.map(([id, c]) => {
        const cu = byId.get(id);
        return {
          name: cu?.name ?? '',
          phone: cu?.phone ?? '',
          email: cu?.email ?? '',
          orders: c.orders,
          spent: c.spent,
          aov: averageOrderValue(c.spent, c.orders),
          last: istStamp(c.last),
          joined: cu ? istDay(cu.createdAt) : '',
          status: cu?.status ?? '',
        };
      }),
      notes: [
        `Rows are the customers who ordered in the period, highest spend first (top ${USER_ROWS}).`,
        'Spend counts confirmed and later orders only.',
      ],
    };
  }

  private productKey(l: ReportLine, meta: Map<string, VariantMeta>) {
    const m = meta.get(l.variantId);
    return m ? { key: m.productId, label: m.product } : { key: `sku:${l.sku}`, label: `${l.title} (removed product)` };
  }

  private async products(range: ReportRange): Promise<ReportResponse> {
    const { lines, meta } = await this.loadSales(range);
    const rows = groupLines(lines, (l) => this.productKey(l, meta)).sort((a, b) => b.sales - a.sales);
    const catOf = new Map<string, { category: string; brand: string }>();
    for (const m of meta.values()) catOf.set(m.productId, { category: m.category, brand: m.brand });
    const units = rows.reduce((s, r) => s + r.units, 0);
    const sales = rows.reduce((s, r) => s + r.sales, 0);
    return {
      id: 'products',
      title: 'Product report',
      range: { from: range.from, to: range.to },
      cards: [count('Products sold', rows.length), count('Units sold', units), money('Sales (without GST)', sales, { tone: 'good' })],
      chart: this.topChart('Top 10 products by sales', rows, (r) => r.sales, 'money'),
      columns: [
        { key: 'product', label: 'Product', kind: 'text' },
        { key: 'category', label: 'Category', kind: 'text' },
        { key: 'brand', label: 'Brand', kind: 'text' },
        { key: 'units', label: 'Units sold', kind: 'int' },
        { key: 'returned', label: 'Units returned', kind: 'int' },
        { key: 'orders', label: 'Orders', kind: 'int' },
        { key: 'sales', label: 'Sales', kind: 'money' },
        { key: 'avg', label: 'Average price', kind: 'money' },
      ],
      rows: rows.map((r) => ({
        product: r.label,
        category: catOf.get(r.key)?.category ?? '',
        brand: catOf.get(r.key)?.brand ?? '',
        units: r.units,
        returned: r.returnedUnits,
        orders: r.orders,
        sales: r.sales,
        avg: r.units > 0 ? Math.round(r.sales / r.units) : 0,
      })),
      notes: ['Sales are without GST and after the order discount. Units sold do not include returned units.'],
    };
  }

  private async byGroup(range: ReportRange, kind: 'categories' | 'brands'): Promise<ReportResponse> {
    const { lines, meta } = await this.loadSales(range);
    const rows = groupLines(lines, (l) => {
      const m = meta.get(l.variantId);
      const name = kind === 'categories' ? (m?.category ?? 'Removed products') : (m?.brand ?? 'Removed products');
      return { key: name, label: name };
    }).sort((a, b) => b.sales - a.sales);
    const total = rows.reduce((s, r) => s + r.sales, 0);
    const label = kind === 'categories' ? 'Category' : 'Brand';
    return {
      id: kind,
      title: kind === 'categories' ? 'Category report' : 'Brand report',
      range: { from: range.from, to: range.to },
      cards: [
        count(kind === 'categories' ? 'Categories sold' : 'Brands sold', rows.length),
        count('Units sold', rows.reduce((s, r) => s + r.units, 0)),
        money('Sales (without GST)', total, { tone: 'good' }),
      ],
      chart: this.topChart(`Top 10 by sales`, rows, (r) => r.sales, 'money'),
      columns: [
        { key: 'name', label, kind: 'text' },
        { key: 'units', label: 'Units sold', kind: 'int' },
        { key: 'orders', label: 'Orders', kind: 'int' },
        { key: 'sales', label: 'Sales', kind: 'money' },
        { key: 'share', label: 'Share of sales', kind: 'pct' },
      ],
      rows: rows.map((r) => ({
        name: r.label,
        units: r.units,
        orders: r.orders,
        sales: r.sales,
        share: total > 0 ? Math.round((r.sales / total) * 10000) / 100 : 0,
      })),
      notes: [
        kind === 'categories'
          ? 'Grouped by the category each product is filed under.'
          : 'Products without a brand are grouped as "No brand".',
      ],
    };
  }

  private async bestSellers(range: ReportRange): Promise<ReportResponse> {
    const { lines, meta } = await this.loadSales(range);
    const rows = groupLines(lines, (l) => this.productKey(l, meta))
      .filter((r) => r.units > 0)
      .sort((a, b) => b.units - a.units || b.sales - a.sales)
      .slice(0, 20);
    return {
      id: 'best-sellers',
      title: 'Best sellers',
      range: { from: range.from, to: range.to },
      cards: [
        count('Products listed', rows.length),
        count('Units sold', rows.reduce((s, r) => s + r.units, 0)),
        money('Sales (without GST)', rows.reduce((s, r) => s + r.sales, 0), { tone: 'good' }),
      ],
      chart: this.topChart('Units sold, top 10', rows, (r) => r.units, 'int'),
      columns: [
        { key: 'rank', label: '#', kind: 'int' },
        { key: 'product', label: 'Product', kind: 'text' },
        { key: 'units', label: 'Units sold', kind: 'int' },
        { key: 'orders', label: 'Orders', kind: 'int' },
        { key: 'sales', label: 'Sales', kind: 'money' },
      ],
      rows: rows.map((r, i) => ({ rank: i + 1, product: r.label, units: r.units, orders: r.orders, sales: r.sales })),
      notes: ['The 20 products that sold the most units in the period.'],
    };
  }

  private async payments(range: ReportRange): Promise<ReportResponse> {
    const rows = await this.prisma.payment.findMany({
      where: this.dateWhere(range),
      select: { provider: true, method: true, status: true, amount: true },
      take: MAX_REPORT_ORDERS + 1,
    });
    if (rows.length > MAX_REPORT_ORDERS) {
      throw new BadRequestException(`More than ${MAX_REPORT_ORDERS} payments in this period. Pick a shorter period.`);
    }
    type Agg = { payments: number; captured: number; pending: number; failed: number; refunded: number };
    const by = new Map<string, Agg>();
    const sumAll: Agg = { payments: 0, captured: 0, pending: 0, failed: 0, refunded: 0 };
    for (const p of rows) {
      const key = providerLabel(p.provider, p.method);
      const a = by.get(key) ?? { payments: 0, captured: 0, pending: 0, failed: 0, refunded: 0 };
      for (const t of [a, sumAll]) {
        t.payments += 1;
        if (p.status === 'captured') t.captured += p.amount;
        else if (p.status === 'refunded' || p.status === 'partially_refunded') t.refunded += p.amount;
        else if (p.status === 'failed') t.failed += 1;
        else t.pending += p.amount;
      }
      by.set(key, a);
    }
    const list = [...by].sort((a, b) => b[1].captured + b[1].pending - (a[1].captured + a[1].pending));
    return {
      id: 'payments',
      title: 'Payment report',
      range: { from: range.from, to: range.to },
      cards: [
        count('Payments', sumAll.payments),
        money('Received online', sumAll.captured, { tone: 'good' }),
        money('Waiting (COD and unpaid)', sumAll.pending, { tone: sumAll.pending > 0 ? 'warn' : undefined }),
        money('Refunded', sumAll.refunded),
        count('Failed attempts', sumAll.failed, { tone: sumAll.failed > 0 ? 'bad' : undefined }),
      ],
      chart: {
        title: 'Received online and waiting, by method',
        kind: 'money',
        points: list.slice(0, 10).map(([label, a]) => ({ label, value: a.captured + a.pending, extra: a.payments })),
      },
      columns: [
        { key: 'method', label: 'Method', kind: 'text' },
        { key: 'payments', label: 'Payments', kind: 'int' },
        { key: 'captured', label: 'Received', kind: 'money' },
        { key: 'pending', label: 'Waiting', kind: 'money' },
        { key: 'refunded', label: 'Refunded', kind: 'money' },
        { key: 'failed', label: 'Failed', kind: 'int' },
      ],
      rows: list.map(([method, a]) => ({ method, ...a })),
      notes: [
        'Cash on delivery stays "waiting" here. The cash a delivery partner collected is in the Delivery cash book.',
        'Payments are counted by the day they were created.',
      ],
    };
  }

  private async profitLossReport(range: ReportRange): Promise<ReportResponse> {
    const { orders, lines, meta } = await this.loadSales(range);
    const pl = profitLoss(orders, lines);
    const groups = groupLines(lines, (l) => this.productKey(l, meta)).sort((a, b) => b.profit - a.profit);

    // Profit per day = line profit + delivery/COD fees of the orders placed that day.
    const days = new Map(eachDateKey(range.from, range.to).map((d) => [d, 0]));
    for (const l of lines) days.set(l.dateKey, (days.get(l.dateKey) ?? 0) + l.netExTax - refundedExTax(l) - lineCogs(l));
    for (const o of orders) {
      const k = istDay(o.createdAt);
      days.set(k, (days.get(k) ?? 0) + o.shipping + o.codFee);
    }

    const cards: ReportCard[] = [
      money('Revenue (without GST)', pl.revenue, { hint: 'Item sales + delivery and COD fees − refunds' }),
      money('Cost of goods sold', pl.cogs),
      money('Gross profit', pl.grossProfit, { tone: pl.grossProfit >= 0 ? 'good' : 'bad' }),
      { label: 'Margin', value: pl.marginPct, kind: 'pct' },
      money('Item sales', pl.itemSales),
      money('Delivery and COD fees', pl.feeIncome),
      money('Refunds', pl.refunds, { tone: pl.refunds > 0 ? 'warn' : undefined }),
    ];
    if (pl.linesMissingCost > 0) {
      cards.push(count('Items with no cost price', pl.linesMissingCost, { tone: 'warn', hint: 'Their profit is overstated' }));
    }
    if (pl.linesEstimatedCost > 0) {
      cards.push(count('Items using today\'s cost', pl.linesEstimatedCost, { hint: 'Older orders, estimated' }));
    }

    return {
      id: 'profit-loss',
      title: 'Profit and loss report',
      range: { from: range.from, to: range.to },
      cards,
      chart: {
        title: 'Gross profit per day',
        kind: 'money',
        points: [...days].map(([d, v]) => ({ label: d.slice(5), value: Math.max(0, v), extra: v < 0 ? v : undefined })),
      },
      columns: [
        { key: 'product', label: 'Product', kind: 'text' },
        { key: 'units', label: 'Units', kind: 'int' },
        { key: 'sales', label: 'Sales', kind: 'money' },
        { key: 'refunds', label: 'Refunds', kind: 'money' },
        { key: 'cogs', label: 'Cost', kind: 'money' },
        { key: 'profit', label: 'Profit', kind: 'money' },
        { key: 'margin', label: 'Margin', kind: 'pct' },
        { key: 'cost', label: 'Cost data', kind: 'text' },
      ],
      rows: groups.map((g) => {
        const net = g.sales - g.refunds;
        const status = costStatus(g);
        return {
          product: g.label,
          units: g.units,
          sales: g.sales,
          refunds: g.refunds,
          cogs: g.cogs,
          profit: g.profit,
          margin: marginPct(g.profit, net),
          cost: status === 'ok' ? 'Saved at order' : status === 'estimated' ? 'Estimated (today\'s cost)' : 'Missing',
        };
      }),
      notes: [
        'Gross profit = sales without GST (after discounts) + delivery and COD fees − refunds − cost of goods. There are no expenses in the system, so this is not net profit.',
        'Cost is the cost price saved on the order item when it was placed. Orders from before that was saved use today\'s cost price and are marked estimated. Items with no cost price at all count as zero cost, so set a cost price on them for a true profit.',
        'Returned units are taken out of sales and their cost is taken out of cost (they go back on the shelf).',
      ],
    };
  }

  private topChart(title: string, rows: GroupRow[], value: (r: GroupRow) => number, kind: 'money' | 'int'): ReportChart | null {
    const points = rows.slice(0, 10).map((r) => ({ label: r.label, value: value(r) }));
    return points.length > 0 ? { title, kind, points } : null;
  }
}
