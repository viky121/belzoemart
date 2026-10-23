import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  discountPct,
  effectiveOrderLimits,
  variantUnitLabel,
  type ProductCardDto,
  type ProductQuery,
} from '@belzo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { SearchProvider, SearchResult } from './search.provider';

/**
 * PostgreSQL full-text search adapter (BR-10). Uses ILIKE + ordering as a
 * portable baseline (works without extensions); a production deployment can
 * enable `pg_trgm` + `tsvector` for ranking and typo tolerance. Only published
 * products are returned.
 */
@Injectable()
export class PostgresSearchProvider implements SearchProvider {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: ProductQuery): Promise<SearchResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const term = query.q?.trim();

    // Hide published products whose variants were all removed (nothing to buy).
    const where: Record<string, unknown> = {
      status: 'published',
      variants: { some: { isActive: true } },
    };
    if (term) {
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          brand: { select: { id: true, name: true } },
          variants: { where: { isActive: true } },
        },
        orderBy: this.orderFor(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    const items: ProductCardDto[] = rows.map((p) => {
      // Card price/default variant come from ACTIVE variants only.
      const active = p.variants.filter((x) => x.isActive !== false);
      const v = active.reduce<(typeof active)[number] | { mrp: number; sellingPrice: number }>(
        (min, cur) => (cur.sellingPrice < min.sellingPrice ? cur : min),
        active[0] ?? { mrp: 0, sellingPrice: 0 },
      );
      const unit = 'id' in v ? variantUnitLabel(v) : null;
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        imageUrl: p.images[0]?.url ?? null,
        mrp: v.mrp as ProductCardDto['mrp'],
        sellingPrice: v.sellingPrice as ProductCardDto['sellingPrice'],
        discountPct: discountPct(v.mrp as never, v.sellingPrice as never),
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        defaultVariantId: 'id' in v ? v.id : null,
        unit,
        brand: p.brand?.name ?? null,
        brandId: p.brand?.id ?? null,
        minQty: 'id' in v ? effectiveOrderLimits(v).min : 1,
      };
    });

    return { items, total, page, pageSize };
  }

  async autocomplete(term: string): Promise<string[]> {
    const trimmed = term.trim();
    if (!trimmed) return [];
    const rows = await this.prisma.product.findMany({
      where: { status: 'published', title: { contains: trimmed, mode: 'insensitive' } },
      select: { title: true },
      take: 8,
      orderBy: { ratingCount: 'desc' },
    });
    return rows.map((r) => r.title);
  }

  async index(): Promise<void> {
    // FTS queries live data; nothing to re-index. A Typesense adapter would push
    // the document here.
  }

  private orderFor(sort: ProductQuery['sort']): Record<string, 'asc' | 'desc'> {
    switch (sort) {
      case 'newest':
        return { createdAt: 'desc' };
      case 'popularity':
        return { ratingCount: 'desc' };
      case 'rating':
        return { ratingAvg: 'desc' };
      default:
        return { ratingCount: 'desc' };
    }
  }
}
