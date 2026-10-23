import { BadRequestException, Injectable } from '@nestjs/common';
import {
  discountPct,
  effectiveOrderLimits,
  MAX_CART_QTY,
  orderLimitsMessage,
  resolveSlabPrice,
  variantUnitLabel,
  type Money,
  type PriceSlabTier,
} from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

const MAX_QTY = MAX_CART_QTY;
const clampQty = (q: number): number => Math.max(1, Math.min(MAX_QTY, Math.trunc(q)));

export interface CartRef {
  customerId?: string;
  guestToken?: string;
}

/**
 * Persistent cart (FR-4.1, FR-4.2, BR-1..BR-3). Supports guest carts (by token)
 * and user carts, quantity clamping, save-for-later, and guest→user merge.
 * Reads revalidate live price/stock from the catalogue.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private async findOrCreateCart(ref: CartRef) {
    if (ref.customerId) {
      const existing = await this.prisma.cart.findUnique({ where: { customerId: ref.customerId } });
      return existing ?? this.prisma.cart.create({ data: { customerId: ref.customerId } });
    }
    if (ref.guestToken) {
      const existing = await this.prisma.cart.findUnique({ where: { guestToken: ref.guestToken } });
      return existing ?? this.prisma.cart.create({ data: { guestToken: ref.guestToken } });
    }
    throw new Error('CartRef requires customerId or guestToken');
  }

  async getCart(ref: CartRef) {
    const cart = await this.findOrCreateCart(ref);
    const items = await this.prisma.cartItem.findMany({ where: { cartId: cart.id } });
    const variantIds = items.map((i) => i.variantId);
    const variants = await this.prisma.variant.findMany({
      where: { id: { in: variantIds } },
      include: { inventory: true, product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    // Bulk pricing tiers are unlocked by the TOTAL units of a product in the
    // cart (summed across all its variants/packs), not per cart line. Only
    // active (not saved-for-later) items count toward the tier.
    const productQty = new Map<string, number>();
    for (const item of items) {
      if (item.savedForLater) continue;
      const v = byId.get(item.variantId);
      // Removed (deactivated or deleted) variants never unlock a tier.
      if (!v || !v.isActive) continue;
      productQty.set(v.productId, (productQty.get(v.productId) ?? 0) + item.quantity);
    }

    const lines = items.map((item) => {
      const v = byId.get(item.variantId);
      // A lingering line for a removed variant is shown as unavailable; checkout blocks it.
      const unavailable = !v || !v.isActive;
      const available = unavailable ? 0 : (v?.inventory?.available ?? 0);
      const base = (v?.sellingPrice ?? 0) as Money;
      const slabs = (v?.priceSlabsJson as unknown as PriceSlabTier[] | null) ?? [];
      // Resolve the tier by the product's total quantity across all its packs.
      const tierQty = (v?.productId && productQty.get(v.productId)) || item.quantity;
      const unitPrice = resolveSlabPrice(base, slabs, tierQty);
      const unit = variantUnitLabel(v);
      const limits = effectiveOrderLimits(v);
      return {
        id: item.id,
        variantId: item.variantId,
        productId: v?.productId ?? '',
        quantity: item.quantity,
        savedForLater: item.savedForLater,
        title: v?.product.title ?? 'Unavailable',
        sku: v?.sku ?? '',
        unit,
        imageUrl: v?.product.images[0]?.url ?? v?.imageUrl ?? null,
        unitPrice,
        basePrice: base,
        mrp: (v?.mrp ?? 0) as Money,
        discountPct: discountPct((v?.mrp ?? 0) as Money, unitPrice),
        taxRatePct: v?.product.taxRatePct ?? 0,
        // If stock is below the minimum order quantity nobody can buy it, so it counts as out of stock.
        inStock: !unavailable && available >= Math.max(item.quantity, limits.min),
        unavailable,
        available,
        minQty: limits.min,
        maxQty: limits.max,
        priceSlabs: slabs,
        tierQty,
      };
    });

    return { cartId: cart.id, items: lines };
  }

  /**
   * Add units of a variant. The variant's purchase limits apply: a new line below the minimum starts at
   * the minimum (so a client that always adds 1 still gets a valid line), and going over the maximum is
   * refused with a clear message. `clamp` (reorder) trims to the limits instead of refusing.
   */
  async addItem(ref: CartRef, variantId: string, quantity: number, opts: { clamp?: boolean } = {}) {
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        isActive: true,
        minOrderQty: true,
        maxOrderQty: true,
        product: { select: { title: true } },
      },
    });
    if (!variant || !variant.isActive) {
      throw new BadRequestException('This product option is no longer available');
    }
    const limits = effectiveOrderLimits(variant);
    const title = variant.product?.title ?? 'this product';
    const cart = await this.findOrCreateCart(ref);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    let target = clampQty((existing?.quantity ?? 0) + quantity);
    if (target < limits.min) target = limits.min;
    if (target > limits.max) {
      if (!opts.clamp) throw new BadRequestException(orderLimitsMessage(title, limits, target));
      target = limits.max;
    }
    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: target, savedForLater: false },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity: target },
      });
    }
    return this.getCart(ref);
  }

  async updateItem(ref: CartRef, variantId: string, quantity: number) {
    const cart = await this.findOrCreateCart(ref);
    const qty = clampQty(quantity);
    // A line for a removed variant has no limits left to check; anything else must stay within them.
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
      select: { minOrderQty: true, maxOrderQty: true, product: { select: { title: true } } },
    });
    if (variant) {
      const limits = effectiveOrderLimits(variant);
      if (qty < limits.min || qty > limits.max) {
        throw new BadRequestException(orderLimitsMessage(variant.product?.title ?? 'this product', limits, qty));
      }
    }
    await this.prisma.cartItem.update({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      data: { quantity: qty },
    });
    return this.getCart(ref);
  }

  async removeItem(ref: CartRef, variantId: string) {
    const cart = await this.findOrCreateCart(ref);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    return this.getCart(ref);
  }

  async saveForLater(ref: CartRef, variantId: string, saved = true) {
    const cart = await this.findOrCreateCart(ref);
    const data: { savedForLater: boolean; quantity?: number } = { savedForLater: saved };
    if (!saved) {
      // The limits may have changed while the line was parked, so bring the quantity back inside them.
      const [item, variant] = await Promise.all([
        this.prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } }),
        this.prisma.variant.findUnique({
          where: { id: variantId },
          select: { minOrderQty: true, maxOrderQty: true },
        }),
      ]);
      if (item && variant) {
        const limits = effectiveOrderLimits(variant);
        const qty = Math.min(limits.max, Math.max(limits.min, item.quantity));
        if (qty !== item.quantity) data.quantity = qty;
      }
    }
    await this.prisma.cartItem.update({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      data,
    });
    return this.getCart(ref);
  }

  /** Remove the active (not saved-for-later) lines for the given variants from a customer's cart. Never creates a cart. */
  async removePurchased(customerId: string, variantIds: string[]): Promise<number> {
    if (variantIds.length === 0) return 0;
    const cart = await this.prisma.cart.findUnique({ where: { customerId } });
    if (!cart) return 0;
    const { count } = await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, variantId: { in: variantIds }, savedForLater: false },
    });
    return count;
  }

  /** Merge a guest cart into the user's cart on login (BR-2): quantities sum. */
  async merge(guestToken: string, customerId: string) {
    const guestCart = await this.prisma.cart.findUnique({
      where: { guestToken },
      include: { items: true },
    });
    if (!guestCart) return this.getCart({ customerId });
    const userCart = await this.findOrCreateCart({ customerId });
    const limitRows = await this.prisma.variant.findMany({
      where: { id: { in: guestCart.items.map((i) => i.variantId) } },
      select: { id: true, minOrderQty: true, maxOrderQty: true },
    });
    const limitsById = new Map(limitRows.map((v) => [v.id, effectiveOrderLimits(v)]));
    // Nobody chose this quantity (login did), so trim it into the variant's limits instead of failing.
    const fit = (variantId: string, qty: number) => {
      const l = limitsById.get(variantId);
      const q = clampQty(qty);
      return l ? Math.min(l.max, Math.max(l.min, q)) : q;
    };

    for (const gi of guestCart.items) {
      const existing = await this.prisma.cartItem.findUnique({
        where: { cartId_variantId: { cartId: userCart.id, variantId: gi.variantId } },
      });
      if (existing) {
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: fit(gi.variantId, existing.quantity + gi.quantity) },
        });
      } else {
        await this.prisma.cartItem.create({
          data: { cartId: userCart.id, variantId: gi.variantId, quantity: fit(gi.variantId, gi.quantity) },
        });
      }
    }
    await this.prisma.cart.delete({ where: { id: guestCart.id } });
    return this.getCart({ customerId });
  }
}
