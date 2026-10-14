import { Injectable, NotFoundException } from '@nestjs/common';
import { slugify } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Brand master (FR-8.7). */
@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  /** All brands (any status) with product counts, for the admin manager. */
  adminList() {
    return this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  /** Delete a brand; detaches it from any products first (keeps the products). */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    await this.prisma.product.updateMany({ where: { brandId: id }, data: { brandId: null } });
    await this.prisma.brand.delete({ where: { id } });
    return { deleted: true };
  }

  private async uniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugify(name) || 'brand';
    let slug = base;
    let n = 1;
    for (;;) {
      const existing = await this.prisma.brand.findUnique({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${++n}`;
    }
  }

  async upsert(input: { id?: string; name: string; logoUrl?: string }) {
    const slug = await this.uniqueSlug(input.name, input.id);
    if (input.id) {
      return this.prisma.brand.update({
        where: { id: input.id },
        data: { name: input.name, slug, logoUrl: input.logoUrl },
      });
    }
    return this.prisma.brand.create({ data: { name: input.name, slug, logoUrl: input.logoUrl } });
  }
}
