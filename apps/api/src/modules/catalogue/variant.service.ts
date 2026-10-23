import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MAX_CART_QTY, weightToGrams, type WeightUnit } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Variant management (FR-3.2, FR-8.2). Enforces the price invariant
 * 0 <= sellingPrice <= mrp (BR-4). Creates a zeroed inventory row for new
 * variants so stock can be adjusted immediately.
 */
@Injectable()
export class VariantService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPrices(mrp: number, sellingPrice: number): void {
    if (mrp < 0 || sellingPrice < 0) throw new BadRequestException('Prices must be non-negative');
    if (sellingPrice > mrp) throw new BadRequestException('sellingPrice cannot exceed mrp');
  }

  /**
   * The purchase limits must be whole numbers within 1..MAX_CART_QTY with min <= max. When only one of the
   * two is being changed, it is checked against the value already stored.
   */
  private async assertOrderQtyLimits(input: {
    id?: string;
    minOrderQty?: number | null;
    maxOrderQty?: number | null;
  }): Promise<void> {
    if (input.minOrderQty === undefined && input.maxOrderQty === undefined) return;
    let min = input.minOrderQty;
    let max = input.maxOrderQty;
    if ((min === undefined || max === undefined) && input.id) {
      const cur = await this.prisma.variant.findUnique({
        where: { id: input.id },
        select: { minOrderQty: true, maxOrderQty: true },
      });
      if (min === undefined) min = cur?.minOrderQty ?? null;
      if (max === undefined) max = cur?.maxOrderQty ?? null;
    }
    for (const [label, v] of [['Minimum', min], ['Maximum', max]] as const) {
      if (v != null && (!Number.isInteger(v) || v < 1 || v > MAX_CART_QTY)) {
        throw new BadRequestException(`${label} order quantity must be a whole number from 1 to ${MAX_CART_QTY}`);
      }
    }
    if (min != null && max != null && min > max) {
      throw new BadRequestException('Minimum order quantity cannot be more than the maximum');
    }
  }

  /** Change only a variant's purchase limits. undefined leaves a value as is, null clears it. */
  async setOrderLimits(id: string, minOrderQty?: number | null, maxOrderQty?: number | null) {
    const exists = await this.prisma.variant.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Variant not found');
    await this.assertOrderQtyLimits({ id, minOrderQty, maxOrderQty });
    return this.prisma.variant.update({
      where: { id },
      data: {
        ...(minOrderQty !== undefined ? { minOrderQty } : {}),
        ...(maxOrderQty !== undefined ? { maxOrderQty } : {}),
      },
      select: { id: true, minOrderQty: true, maxOrderQty: true },
    });
  }

  /** Normalise + validate bulk price slabs: minQty>=2 ascending & unique,
   *  0 <= unitPrice <= sellingPrice (a slab is never dearer than the base). */
  private normaliseSlabs(
    slabs: { minQty: number; unitPrice: number }[] | undefined,
    sellingPrice: number,
  ): { minQty: number; unitPrice: number }[] {
    if (!slabs || slabs.length === 0) return [];
    const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
    const seen = new Set<number>();
    for (const s of sorted) {
      if (s.minQty < 2) throw new BadRequestException('Slab minQty must be at least 2');
      if (seen.has(s.minQty)) throw new BadRequestException('Duplicate slab minQty');
      seen.add(s.minQty);
      if (s.unitPrice < 0 || s.unitPrice > sellingPrice) {
        throw new BadRequestException('Slab price must be between 0 and the selling price');
      }
    }
    return sorted;
  }

  /** Active variants only — removed (deactivated) variants are kept for order history but hidden. */
  listByProduct(productId: string) {
    return this.prisma.variant.findMany({
      where: { productId, isActive: true },
      include: { inventory: true },
    });
  }

  /**
   * Remove a variant from a product (e.g. drop 500 ml from 200 ml / 500 ml / 1000 ml).
   * - A variant that appears in any OrderItem is SOFT-deleted (isActive=false): the row and its
   *   inventory stay so invoices, returns, cancellations and restocks keep working.
   * - A never-ordered variant is HARD-deleted (inventory cascades) so its SKU can be reused.
   * - Either way it is taken out of every cart and wishlist. StockMovement history is untouched.
   * - The last active variant of a PUBLISHED product cannot be removed (unpublish or delete the
   *   product instead); draft/archived products may lose their last variant.
   * Removing an already-inactive variant is idempotent (mode 'deactivated').
   */
  async remove(id: string): Promise<{ removed: true; mode: 'deleted' | 'deactivated' }> {
    const v = await this.prisma.variant.findUnique({
      where: { id },
      include: { product: { select: { id: true, status: true } } },
    });
    if (!v) throw new NotFoundException('Variant not found');
    if (v.isActive && v.product.status === 'published') {
      const active = await this.prisma.variant.count({
        where: { productId: v.productId, isActive: true },
      });
      if (active <= 1) {
        throw new BadRequestException(
          'This is the last active variant of a published product. Unpublish the product (set it to Draft) or delete the whole product instead.',
        );
      }
    }
    const ordered = (await this.prisma.orderItem.count({ where: { variantId: id } })) > 0;
    const soft = ordered || !v.isActive;
    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { variantId: id } });
      await tx.wishlistItem.deleteMany({ where: { variantId: id } });
      if (soft) {
        await tx.variant.update({ where: { id }, data: { isActive: false } });
      } else {
        await tx.variant.delete({ where: { id } });
      }
    });
    return { removed: true, mode: soft ? 'deactivated' : 'deleted' };
  }

  async upsert(input: {
    id?: string;
    productId: string;
    sku: string;
    mrp: number;
    sellingPrice: number;
    attributes?: Record<string, string>;
    weightGrams?: number;
    /** Weight / pack size as entered, with its unit. undefined = unchanged on update, null = clear. */
    weightValue?: number | null;
    weightUnit?: WeightUnit | null;
    imageUrl?: string;
    priceSlabs?: { minQty: number; unitPrice: number }[];
    /** Purchase price, paise. ADMIN-ONLY. undefined = leave unchanged on update. */
    costPrice?: number | null;
    /** Fewest / most units per order. undefined = unchanged on update, null = no limit. */
    minOrderQty?: number | null;
    maxOrderQty?: number | null;
  }) {
    this.assertPrices(input.mrp, input.sellingPrice);
    await this.assertOrderQtyLimits(input);
    // A value needs a unit and vice versa. Mass/volume units set the courier weight (a count has no mass,
    // so for count/pc the grams the caller sent, or the shop default when 0, still apply).
    const hasValue = input.weightValue != null;
    const hasUnit = input.weightUnit != null;
    if (hasValue !== hasUnit) throw new BadRequestException('Enter the weight together with its unit');
    const derivedGrams = hasValue && hasUnit ? weightToGrams(input.weightValue!, input.weightUnit!) : null;
    const weightGrams = derivedGrams ?? input.weightGrams;
    const weightFields = {
      ...(input.weightValue !== undefined ? { weightValue: input.weightValue } : {}),
      ...(input.weightUnit !== undefined ? { weightUnit: input.weightUnit } : {}),
    };
    const priceSlabsJson = this.normaliseSlabs(input.priceSlabs, input.sellingPrice);
    const qtyLimitFields = {
      ...(input.minOrderQty !== undefined ? { minOrderQty: input.minOrderQty } : {}),
      ...(input.maxOrderQty !== undefined ? { maxOrderQty: input.maxOrderQty } : {}),
    };
    // Variant.sku is unique: report a clash as 409 instead of a generic 500.
    const clash = await this.prisma.variant.findUnique({
      where: { sku: input.sku },
      select: { id: true, isActive: true },
    });
    if (clash && clash.id !== input.id) {
      if (clash.isActive === false) {
        throw new ConflictException(
          `SKU "${input.sku}" belongs to a removed variant kept for order history — re-upload it via Bulk upload to restore it, or use a different SKU`,
        );
      }
      throw new ConflictException(`SKU "${input.sku}" is already used by another variant`);
    }
    // A variant SKU may not equal another product's Parent SKU (the bulk sheet keys on both).
    const owner = await this.prisma.product.findUnique({
      where: { sku: input.sku },
      select: { id: true, title: true },
    });
    if (owner && owner.id !== input.productId) {
      throw new ConflictException(
        `SKU "${input.sku}" is the Parent SKU of "${owner.title}" — use a different SKU`,
      );
    }
    if (input.id) {
      return this.prisma.variant.update({
        where: { id: input.id },
        data: {
          sku: input.sku,
          mrp: input.mrp,
          sellingPrice: input.sellingPrice,
          attributesJson: input.attributes ?? {},
          priceSlabsJson,
          weightGrams,
          ...weightFields,
          imageUrl: input.imageUrl,
          ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
          ...qtyLimitFields,
        },
      });
    }
    const variant = await this.prisma.variant.create({
      data: {
        productId: input.productId,
        sku: input.sku,
        mrp: input.mrp,
        sellingPrice: input.sellingPrice,
        attributesJson: input.attributes ?? {},
        priceSlabsJson,
        weightGrams: weightGrams ?? 0,
        ...weightFields,
        costPrice: input.costPrice ?? null,
        ...qtyLimitFields,
      },
    });
    await this.prisma.inventory.create({ data: { variantId: variant.id, available: 0 } });
    return variant;
  }
}
