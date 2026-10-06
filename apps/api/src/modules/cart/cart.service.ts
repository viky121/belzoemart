import { BadRequestException, Injectable } from '@nestjs/common';
import { discountPct, resolveSlabPrice, type Money, type PriceSlabTier } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

const MAX_QTY = 99;
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
      const attrs = (v?.attributesJson as Record<string, string> | null) ?? {};
      const unit =
        ['Weight', 'Net Weight', 'Volume', 'Size', 'Pack', 'Quantity']
          .map((key) => Object.entries(attrs).find(([k]) => k.toLowerCase() === key.toLowerCase()))
          .find((e) => e && e[1])?.[1] ??
        (v?.weightGrams
          ? v.weightGrams >= 1000
            ? `${v.weightGrams / 1000} kg`
            : `${v.weightGrams} g`
          : null);
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
        inStock: !unavailable && available >= item.quantity,
        unavailable,
        available,
        priceSlabs: slabs,
        tierQty,
      };
    });

    return { cartId: cart.id, items: lines };
  }

  async addItem(ref: CartRef, variantId: string, quantity: number) {
    const variant = await this.prisma.variant.findUnique({
      where: { id: variantId },
      select: { id: true, isActive: true },
    });
    if (!variant || !variant.isActive) {
      throw new BadRequestException('This product option is no longer available');
    }
    const cart = await this.findOrCreateCart(ref);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: clampQty(existing.quantity + quantity), savedForLater: false },
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, variantId, quantity: clampQty(quantity) },
      });
    }
    return this.getCart(ref);
  }

  async updateItem(ref: CartRef, variantId: string, quantity: number) {
    const cart = await this.findOrCreateCart(ref);
    await this.prisma.cartItem.update({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      data: { quantity: clampQty(quantity) },
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
    await this.prisma.cartItem.update({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      data: { savedForLater: saved },
    });
    return this.getCart(ref);
  }

  /** Merge a guest cart into the user's cart on login (BR-2): quantities sum. */
  async merge(guestToken: string, customerId: string) {
    const guestCart = await this.prisma.cart.findUnique({
      where: { guestToken },
      include: { items: true },
    });
    if (!guestCart) return this.getCart({ customerId });
    const userCart = await this.findOrCreateCart({ customerId });

    for (const gi of guestCart.items) {
      const existing = await this.prisma.cartItem.findUnique({
        where: { cartId_variantId: { cartId: userCart.id, variantId: gi.variantId } },
      });
      if (existing) {
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: clampQty(existing.quantity + gi.quantity) },
        });
      } else {
        await this.prisma.cartItem.create({
          data: { cartId: userCart.id, variantId: gi.variantId, quantity: clampQty(gi.quantity) },
        });
      }
    }
    await this.prisma.cart.delete({ where: { id: guestCart.id } });
    return this.getCart({ customerId });
  }
}
