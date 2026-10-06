import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canCustomerCancel, canTransition, type OrderStatus } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryService } from '../catalogue/inventory.service';
import { PaymentService } from '../checkout/payment.service';
import { CartService } from '../cart/cart.service';

/**
 * Order lifecycle (BR-1..BR-3, FR-5). Enforces the shared state machine on
 * every transition, handles customer/admin cancellation with stock release and
 * refund, and one-tap reorder.
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
    private readonly cart: CartService,
  ) {}

  /** Resolve a display image + product slug for a set of variant ids. */
  private async productMetaForVariants(
    variantIds: string[],
  ): Promise<Map<string, { imageUrl: string | null; slug: string | null }>> {
    const ids = [...new Set(variantIds)];
    if (ids.length === 0) return new Map();
    const variants = await this.prisma.variant.findMany({
      where: { id: { in: ids } },
      include: { product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } } },
    });
    return new Map(
      variants.map((v) => [
        v.id,
        { imageUrl: v.product.images[0]?.url ?? v.imageUrl ?? null, slug: v.product.slug ?? null },
      ]),
    );
  }

  async getForCustomer(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true, shipments: { include: { events: true } }, invoice: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== customerId) throw new ForbiddenException('Not your order'); // IDOR (SECURITY-08)
    const meta = await this.productMetaForVariants(order.items.map((i) => i.variantId));
    return {
      ...order,
      items: order.items.map((i) => ({
        ...i,
        imageUrl: meta.get(i.variantId)?.imageUrl ?? null,
        slug: meta.get(i.variantId)?.slug ?? null,
      })),
    };
  }

  async listForCustomer(customerId: string, status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: { customerId, ...(status ? { status } : {}) },
      include: { items: true, shipments: true },
      orderBy: { createdAt: 'desc' },
    });
    const meta = await this.productMetaForVariants(
      orders.flatMap((o) => o.items.map((i) => i.variantId)),
    );
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      grandTotal: o.grandTotal,
      createdAt: o.createdAt,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      imageUrl: o.items[0] ? (meta.get(o.items[0].variantId)?.imageUrl ?? null) : null,
      items: o.items.map((i) => ({
        title: i.title,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        imageUrl: meta.get(i.variantId)?.imageUrl ?? null,
        slug: meta.get(i.variantId)?.slug ?? null,
      })),
    }));
  }

  async adminList(query: { status?: OrderStatus; page?: number; pageSize?: number; q?: string }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const q = query.q?.trim();
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { id: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows, total, page, pageSize };
  }

  /** Validated state transition (BR-1). */
  async transition(orderId: string, to: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!canTransition(order.status, to)) {
      throw new BadRequestException(`Illegal transition ${order.status} → ${to}`);
    }
    return this.prisma.order.update({ where: { id: orderId }, data: { status: to } });
  }

  /**
   * Cancel an order (BR-2, BR-3). Customers may cancel only pending/confirmed;
   * admins may cancel up to shipped. Releases reserved stock and refunds a
   * captured payment.
   */
  async cancel(orderId: string, actor: { customerId?: string; isAdmin?: boolean }, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (actor.customerId) {
      if (order.customerId !== actor.customerId) throw new ForbiddenException('Not your order');
      if (!canCustomerCancel(order.status)) {
        throw new BadRequestException('Order can no longer be cancelled');
      }
    } else if (actor.isAdmin) {
      const cancellable: OrderStatus[] = ['pending', 'confirmed', 'packed', 'shipped'];
      if (!cancellable.includes(order.status)) {
        throw new BadRequestException('Order can no longer be cancelled');
      }
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'cancelled', cancelledReason: reason },
    });

    // Release stock: reserved (if still pending) or restock (if confirmed/sale).
    for (const item of order.items) {
      if (order.status === 'pending') {
        await this.inventory.release(item.variantId, item.quantity, order.id);
      } else {
        await this.inventory.adjust(item.variantId, item.quantity, `cancel:${order.id}`);
      }
    }

    // Refund captured payments.
    const captured = order.payments.find((p) => p.status === 'captured');
    if (captured) {
      await this.payments.refund(order.id, order.grandTotal);
    }
    return { orderId, status: 'cancelled' as const };
  }

  /** One-tap reorder (FR-5.7): add the order's items back to the cart. */
  async reorder(customerId: string, orderId: string) {
    const order = await this.getForCustomer(customerId, orderId);
    for (const item of order.items) {
      try {
        await this.cart.addItem({ customerId }, item.variantId, item.quantity);
      } catch (e) {
        // A variant removed since the order was placed is skipped, not fatal.
        if (!(e instanceof BadRequestException)) throw e;
      }
    }
    return this.cart.getCart({ customerId });
  }
}
