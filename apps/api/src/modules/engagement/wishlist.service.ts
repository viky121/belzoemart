import { Injectable } from '@nestjs/common';
import { effectiveOrderLimits, variantUnitLabel } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Wishlist (FR-6.1, BR-1). Add is idempotent per (customer, variant) via the
 * unique constraint.
 */
@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string) {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    const variantIds = rows.map((r) => r.variantId);
    if (variantIds.length === 0) return [];
    const variants = await this.prisma.variant.findMany({
      where: { id: { in: variantIds } },
      include: {
        inventory: true,
        product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    return rows.map((r) => {
      const v = byId.get(r.variantId);
      const mrp = v?.mrp ?? 0;
      const sellingPrice = v?.sellingPrice ?? 0;
      const unit = variantUnitLabel(v);
      const limits = effectiveOrderLimits(v);
      return {
        id: r.id,
        variantId: r.variantId,
        createdAt: r.createdAt,
        title: v?.product.title ?? 'Unavailable',
        slug: v?.product.slug ?? null,
        imageUrl: v?.product.images[0]?.url ?? v?.imageUrl ?? null,
        unit,
        mrp,
        sellingPrice,
        discountPct: mrp > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0,
        inStock: !!v && v.isActive && (v.inventory?.available ?? 0) >= limits.min,
        minQty: limits.min,
      };
    });
  }

  async add(customerId: string, variantId: string) {
    await this.prisma.wishlistItem.upsert({
      where: { customerId_variantId: { customerId, variantId } },
      update: {},
      create: { customerId, variantId },
    });
    return this.list(customerId);
  }

  async remove(customerId: string, variantId: string) {
    await this.prisma.wishlistItem.deleteMany({ where: { customerId, variantId } });
    return this.list(customerId);
  }
}
