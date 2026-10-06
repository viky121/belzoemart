import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
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

  listByProduct(productId: string) {
    return this.prisma.variant.findMany({ where: { productId }, include: { inventory: true } });
  }

  async upsert(input: {
    id?: string;
    productId: string;
    sku: string;
    mrp: number;
    sellingPrice: number;
    attributes?: Record<string, string>;
    weightGrams?: number;
    imageUrl?: string;
    priceSlabs?: { minQty: number; unitPrice: number }[];
  }) {
    this.assertPrices(input.mrp, input.sellingPrice);
    const priceSlabsJson = this.normaliseSlabs(input.priceSlabs, input.sellingPrice);
    // Variant.sku is unique: report a clash as 409 instead of a generic 500.
    const clash = await this.prisma.variant.findUnique({
      where: { sku: input.sku },
      select: { id: true },
    });
    if (clash && clash.id !== input.id) {
      throw new ConflictException(`SKU "${input.sku}" is already used by another variant`);
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
          weightGrams: input.weightGrams,
          imageUrl: input.imageUrl,
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
        weightGrams: input.weightGrams ?? 0,
      },
    });
    await this.prisma.inventory.create({ data: { variantId: variant.id, available: 0 } });
    return variant;
  }
}
