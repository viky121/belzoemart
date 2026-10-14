import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

type OrderStatusLiteral =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned';

const REVENUE_STATUSES: OrderStatusLiteral[] = [
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

/** Admin customer directory (FR-11): list, detail, and block/unblock. */
@Injectable()
export class AdminCustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 20), 100);
    const q = query.q?.trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const ids = rows.map((r) => r.id);
    const [counts, spends] = ids.length
      ? await Promise.all([
          this.prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _count: { _all: true } }),
          this.prisma.order.groupBy({
            by: ['customerId'],
            where: { customerId: { in: ids }, status: { in: REVENUE_STATUSES } },
            _sum: { grandTotal: true },
          }),
        ])
      : [[], []];

    const countById = new Map(counts.map((g) => [g.customerId, g._count._all]));
    const spendById = new Map(spends.map((g) => [g.customerId, g._sum.grandTotal ?? 0]));

    return {
      items: rows.map((r) => ({
        ...r,
        orderCount: countById.get(r.id) ?? 0,
        totalSpent: spendById.get(r.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, status: true, locale: true, createdAt: true },
    });
    if (!c) throw new NotFoundException('Customer not found');
    const [addresses, orders] = await Promise.all([
      this.prisma.address.findMany({ where: { customerId: id } }),
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, status: true, grandTotal: true, createdAt: true },
      }),
    ]);
    return { ...c, addresses, orders };
  }

  async setStatus(id: string, status: 'active' | 'blocked') {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({ where: { id }, data: { status }, select: { id: true, status: true } });
  }
}
