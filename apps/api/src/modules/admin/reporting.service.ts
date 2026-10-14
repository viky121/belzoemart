import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { averageOrderValue, toCsv } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

interface DateRange {
  from?: string;
  to?: string;
}

/**
 * Admin reporting (FR-7, FR-12). Aggregates orders/inventory/customers for the
 * dashboard and downloadable reports. Revenue excludes cancelled orders.
 */
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  private range(r: DateRange) {
    const gte = r.from ? new Date(r.from) : undefined;
    const lte = r.to ? new Date(r.to) : undefined;
    return gte || lte ? { createdAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {};
  }

  private readonly revenueStatuses: OrderStatus[] = [
    OrderStatus.confirmed,
    OrderStatus.packed,
    OrderStatus.shipped,
    OrderStatus.out_for_delivery,
    OrderStatus.delivered,
  ];

  /** Dashboard KPIs (BR-1). */
  async dashboard() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayOrders, pendingOrders, newCustomers, lowStock, revenueAgg] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: startOfDay }, status: { in: this.revenueStatuses } },
        select: { grandTotal: true },
      }),
      this.prisma.order.count({ where: { status: 'pending' } }),
      this.prisma.customer.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.inventory.count({ where: { available: { lte: 5 } } }),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: startOfDay }, status: { in: this.revenueStatuses } },
        _sum: { grandTotal: true },
        _count: true,
      }),
    ]);

    const revenue = revenueAgg._sum?.grandTotal ?? 0;
    const orders = typeof revenueAgg._count === 'number' ? revenueAgg._count : 0;
    return {
      todayRevenue: revenue,
      todayOrders: orders,
      aov: averageOrderValue(revenue, orders),
      newCustomers,
      pendingOrders,
      lowStockCount: lowStock,
      _todayOrderCount: todayOrders.length,
    };
  }

  /** Sales report grouped by status within a range (BR-2). */
  async sales(r: DateRange) {
    const orders = await this.prisma.order.groupBy({
      by: ['status'],
      where: { ...this.range(r) },
      _sum: { grandTotal: true },
      _count: true,
    });
    return orders.map((o) => ({ status: o.status, orders: o._count, revenue: o._sum.grandTotal ?? 0 }));
  }

  /** Daily revenue + order counts for the last N days (dashboard chart). */
  async salesTrend(days: number) {
    const n = Math.min(Math.max(Math.trunc(days) || 7, 1), 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (n - 1));
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: start }, status: { in: this.revenueStatuses } },
      select: { grandTotal: true, createdAt: true },
    });
    const buckets = new Map<string, { revenue: number; orders: number }>();
    for (let i = 0; i < n; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
    }
    for (const o of orders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) {
        b.revenue += o.grandTotal;
        b.orders += 1;
      }
    }
    return [...buckets.entries()].map(([date, v]) => ({ date, revenue: v.revenue, orders: v.orders }));
  }

  /** GST/HSN summary from order-item snapshots (BR-3, NFR-2.1). */
  async gst(r: DateRange) {
    const orders = await this.prisma.order.findMany({
      where: { ...this.range(r), status: { in: this.revenueStatuses } },
      select: { cgst: true, sgst: true, igst: true, tax: true, items: { select: { taxRatePct: true } } },
    });
    const byRate = new Map<number, { taxableRate: number; tax: number; orders: number }>();
    let totalTax = 0;
    for (const o of orders) {
      totalTax += o.tax;
      const rate = o.items[0]?.taxRatePct ?? 0;
      const cur = byRate.get(rate) ?? { taxableRate: rate, tax: 0, orders: 0 };
      cur.tax += o.cgst + o.sgst + o.igst;
      cur.orders += 1;
      byRate.set(rate, cur);
    }
    return { totalTax, byRate: [...byRate.values()] };
  }

  /** Inventory report: low-stock variants (BR-4). */
  async inventory() {
    const rows = await this.prisma.inventory.findMany({
      where: { available: { lte: 10 } },
      include: { variant: { include: { product: { select: { title: true } } } } },
      orderBy: { available: 'asc' },
    });
    return rows.map((r) => ({
      sku: r.variant.sku,
      product: r.variant.product.title,
      available: r.available,
      reserved: r.reserved,
      reorderLevel: r.reorderLevel,
    }));
  }

  /** Returns/refunds report (BR-5). */
  async returns(r: DateRange) {
    const grouped = await this.prisma.returnRequest.groupBy({
      by: ['status'],
      where: { ...this.range(r) },
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  /** Payments ledger (admin): recent payments across orders + settlement totals. */
  async payments() {
    const rows = await this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const sumBy = (status: string) =>
      rows.filter((p) => p.status === status).reduce((s, p) => s + p.amount, 0);
    return {
      items: rows.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        provider: p.provider,
        method: p.method,
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt,
      })),
      captured: sumBy('captured'),
      refunded: sumBy('refunded'),
      count: rows.length,
    };
  }

  /** Customer report: new vs repeat (BR-5). */
  async customers() {
    const totalCustomers = await this.prisma.customer.count();
    const repeat = await this.prisma.order.groupBy({
      by: ['customerId'],
      _count: true,
      having: { customerId: { _count: { gt: 1 } } },
    });
    return { totalCustomers, repeatCustomers: repeat.length, newCustomers: totalCustomers - repeat.length };
  }

  /** Export any row set to CSV (BR-6). */
  toCsv(columns: string[], rows: Record<string, unknown>[]): string {
    return toCsv(columns, rows);
  }
}
