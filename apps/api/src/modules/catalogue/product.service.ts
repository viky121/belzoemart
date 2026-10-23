import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  discountPct,
  effectiveOrderLimits,
  slugify,
  variantUnitLabel,
  type ProductCardDto,
  type ProductDetailDto,
  type ProductQuery,
} from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CategoryService } from './category.service';
import { InventoryService } from './inventory.service';
import { normCategoryKey } from './category-match';

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Product catalogue (FR-2, FR-3, FR-8). Read models power the storefront
 * (published only); write operations power the admin panel (all statuses).
 */
@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoryService,
    private readonly inventory: InventoryService,
  ) {}

  private cheapestVariant<T extends { mrp: number; sellingPrice: number }>(
    variants: T[],
  ): T | { mrp: number; sellingPrice: number } {
    return variants.reduce<T | { mrp: number; sellingPrice: number }>(
      (min, v) => (v.sellingPrice < min.sellingPrice ? v : min),
      variants[0] ?? { mrp: 0, sellingPrice: 0 },
    );
  }

  /** Build a human pack label (e.g. "1 kg", "500 ml") from a variant. */
  private unitLabel(v?: {
    attributesJson?: unknown;
    weightGrams?: number;
    weightValue?: number | null;
    weightUnit?: string | null;
  }): string | null {
    return variantUnitLabel(v);
  }

  private toCard(p: {
    id: string;
    title: string;
    slug: string;
    ratingAvg: number;
    ratingCount: number;
    images: { url: string }[];
    brand?: { id: string; name: string } | null;
    variants: {
      id: string;
      mrp: number;
      sellingPrice: number;
      attributesJson?: unknown;
      weightGrams?: number;
      weightValue?: number | null;
      weightUnit?: string | null;
      minOrderQty?: number | null;
      maxOrderQty?: number | null;
      isActive?: boolean;
    }[];
  }): ProductCardDto {
    // Removed (deactivated) variants never drive the card price/default variant.
    const active = p.variants.filter((x) => x.isActive !== false);
    const v = this.cheapestVariant(active);
    const hasId = (x: typeof v): x is (typeof p.variants)[number] => 'id' in x;
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
      defaultVariantId: hasId(v) ? v.id : null,
      unit: hasId(v) ? this.unitLabel(v) : null,
      brand: p.brand?.name ?? null,
      brandId: p.brand?.id ?? null,
      minQty: hasId(v) ? effectiveOrderLimits(v).min : 1,
    };
  }

  /** Storefront listing: published products, filtered/sorted/paginated. */
  async list(query: ProductQuery): Promise<Paginated<ProductCardDto>> {
    // Explicit "by ids" fetch (manual home-page rails). Non-paginated: the
    // caller's id set is already bounded (schema caps it at 50), so we fetch
    // all matching published products, reorder them into the picked order, and
    // slice to the requested pageSize (= the rail limit). The normal paginated
    // path below is left completely untouched for every other query.
    if (query.ids !== undefined) {
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
      const ids = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return { items: [], total: 0, page: 1, pageSize };
      const rows = await this.prisma.product.findMany({
        where: { status: 'published', id: { in: ids }, variants: { some: { isActive: true } } },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          brand: { select: { id: true, name: true } },
          variants: { where: { isActive: true } },
        },
      });
      const byId = new Map(rows.map((p) => [p.id, this.toCard(p)]));
      const items = ids
        .map((id) => byId.get(id))
        .filter((c): c is ProductCardDto => c !== undefined)
        .slice(0, pageSize);
      return { items, total: items.length, page: 1, pageSize };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    // A published product whose variants were all removed has nothing to buy: hide it.
    const where: Record<string, unknown> = {
      status: 'published',
      variants: { some: { isActive: true } },
    };

    if (query.categoryId) {
      where.categoryId = { in: await this.categories.descendantIds(query.categoryId) };
    }
    if (query.brandId) where.brandId = query.brandId;

    const orderBy = this.orderFor(query.sort);
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          brand: { select: { id: true, name: true } },
          variants: { where: { isActive: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    let items = rows.map((p) => this.toCard(p));
    // Price/discount sorts depend on the derived cheapest variant.
    if (query.sort === 'price_asc') items = items.sort((a, b) => a.sellingPrice - b.sellingPrice);
    if (query.sort === 'price_desc') items = items.sort((a, b) => b.sellingPrice - a.sellingPrice);
    if (query.sort === 'discount') items = items.sort((a, b) => b.discountPct - a.discountPct);

    if (query.minPrice != null) items = items.filter((i) => i.sellingPrice >= query.minPrice!);
    if (query.maxPrice != null) items = items.filter((i) => i.sellingPrice <= query.maxPrice!);

    return { items, total, page, pageSize };
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
        return { createdAt: 'desc' };
    }
  }

  async detail(idOrSlug: string): Promise<ProductDetailDto> {
    const p = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        status: 'published',
        variants: { some: { isActive: true } },
      },
      include: {
        images: { orderBy: { position: 'asc' } },
        brand: true,
        variants: { where: { isActive: true }, include: { inventory: true } },
      },
    });
    if (!p) throw new NotFoundException('Product not found');
    const v = this.cheapestVariant(p.variants);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      brand: p.brand?.name ?? null,
      brandId: p.brandId ?? null,
      categoryId: p.categoryId,
      hsnCode: p.hsnCode,
      taxRatePct: p.taxRatePct,
      imageUrl: p.images[0]?.url ?? null,
      mrp: v.mrp as ProductDetailDto['mrp'],
      sellingPrice: v.sellingPrice as ProductDetailDto['sellingPrice'],
      discountPct: discountPct(v.mrp as never, v.sellingPrice as never),
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
      videoUrl: p.videoUrl,
      shgName: p.shgName,
      story: p.story,
      attributes: (p.attributesJson as Record<string, string>) ?? {},
      seo: { title: p.seoTitle, keywords: p.seoKeywords, description: p.seoDescription },
      isReturnable: p.isReturnable,
      variants: p.variants.map((vr) => ({
        id: vr.id,
        sku: vr.sku,
        mrp: vr.mrp as ProductDetailDto['mrp'],
        sellingPrice: vr.sellingPrice as ProductDetailDto['sellingPrice'],
        discountPct: discountPct(vr.mrp as never, vr.sellingPrice as never),
        attributes: (vr.attributesJson as Record<string, string>) ?? {},
        imageUrl: vr.imageUrl,
        // Stock below the minimum order quantity cannot be bought, so it shows as out of stock.
        inStock: (vr.inventory?.available ?? 0) >= effectiveOrderLimits(vr).min,
        minQty: effectiveOrderLimits(vr).min,
        maxQty: effectiveOrderLimits(vr).max,
        priceSlabs:
          (vr.priceSlabsJson as unknown as ProductDetailDto['variants'][number]['priceSlabs']) ??
          [],
      })),
    };
  }

  async uniqueSlug(title: string, excludeId?: string): Promise<string> {
    const base = slugify(title) || 'product';
    let slug = base;
    let n = 1;
    for (;;) {
      const existing = await this.prisma.product.findUnique({ where: { slug } });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${++n}`;
    }
  }

  /** Unique brand slug (same dedup loop as BrandService.uniqueSlug). */
  private async uniqueBrandSlug(name: string): Promise<string> {
    const base = slugify(name) || 'brand';
    let slug = base;
    let n = 1;
    for (;;) {
      const existing = await this.prisma.brand.findUnique({ where: { slug } });
      if (!existing) return slug;
      slug = `${base}-${++n}`;
    }
  }

  /**
   * Find a brand by name (case-insensitive) or create one with a unique slug.
   * Used by the bulk importer so a CSV can carry a brand NAME, not an id.
   */
  async findOrCreateBrandByName(name: string): Promise<{ id: string }> {
    const trimmed = name.trim();
    const existing = await this.prisma.brand.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) return existing;
    return this.prisma.brand.create({
      data: { name: trimmed, slug: await this.uniqueBrandSlug(trimmed) },
    });
  }

  async create(input: {
    title: string;
    description?: string;
    categoryId: string;
    brandId?: string;
    hsnCode?: string;
    taxRatePct?: number;
    isReturnable?: boolean;
    shgName?: string;
    story?: string;
    attributes?: Record<string, string>;
    seoTitle?: string;
    seoKeywords?: string;
    seoDescription?: string;
  }) {
    return this.prisma.product.create({
      data: {
        title: input.title,
        slug: await this.uniqueSlug(input.title),
        description: input.description ?? '',
        categoryId: input.categoryId,
        brandId: input.brandId,
        hsnCode: input.hsnCode ?? '',
        taxRatePct: input.taxRatePct ?? 0,
        isReturnable: input.isReturnable ?? true,
        shgName: input.shgName ?? null,
        story: input.story ?? null,
        attributesJson: input.attributes ?? {},
        seoTitle: input.seoTitle ?? null,
        seoKeywords: input.seoKeywords ?? null,
        seoDescription: input.seoDescription ?? null,
        status: 'draft',
      },
    });
  }

  async setStatus(id: string, status: 'draft' | 'published' | 'archived') {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { where: { isActive: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (status === 'published' && product.variants.length === 0) {
      throw new BadRequestException('Product needs at least one variant to publish');
    }
    return this.prisma.product.update({ where: { id }, data: { status } });
  }

  /**
   * Apply percentage bulk tiers to EVERY active variant of a product at once.
   * Each variant's absolute slab price is derived from its own selling price
   * (unitPrice = round(sellingPrice Ã— (1 âˆ’ discountPct/100))), so packs with
   * different base prices each get a correct tier price.
   */
  async applyPriceSlabs(
    productId: string,
    tiers: { minQty: number; discountPct: number }[],
  ): Promise<{ updated: number }> {
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    const seen = new Set<number>();
    for (const t of sorted) {
      if (!Number.isInteger(t.minQty) || t.minQty < 2) {
        throw new BadRequestException('Tier minQty must be an integer â‰¥ 2');
      }
      if (seen.has(t.minQty)) throw new BadRequestException('Duplicate tier minQty');
      seen.add(t.minQty);
      if (t.discountPct < 0 || t.discountPct > 95) {
        throw new BadRequestException('Tier discount must be between 0 and 95%');
      }
    }
    const variants = await this.prisma.variant.findMany({
      where: { productId, isActive: true },
    });
    if (variants.length === 0) throw new NotFoundException('Product has no variants');
    await this.prisma.$transaction(
      variants.map((v) =>
        this.prisma.variant.update({
          where: { id: v.id },
          data: {
            priceSlabsJson: sorted.map((t) => ({
              minQty: t.minQty,
              unitPrice: Math.round(v.sellingPrice * (1 - t.discountPct / 100)),
            })),
          },
        }),
      ),
    );
    return { updated: variants.length };
  }

  /**
   * Apply a single edit to many products at once (admin bulk actions).
   *
   * - `offer`  â€” derive each active variant's sellingPrice from its own MRP:
   *              percent â†’ round(mrp Ã— (1 âˆ’ value/100)); fixed â†’ max(0, mrp âˆ’ value paise).
   * - `price`  â€” set an absolute sellingPrice (paise) on every active variant;
   *              a product whose MRP is below that price is reported, not changed.
   * - `stock`  â€” set / increase / decrease the DEFAULT variant's available qty,
   *              routed through InventoryService.adjust so the StockMovement audit
   *              trail is preserved (available is clamped at 0 on decrease).
   *
   * Per-product try/catch mirrors bulkUpsert: one bad product never aborts the
   * rest. Returns a per-product result list for the UI.
   */
  async bulkEdit(input: {
    productIds: string[];
    operation:
      | { kind: 'offer'; mode: 'percent' | 'fixed'; value: number }
      | { kind: 'price'; value: number }
      | { kind: 'stock'; mode: 'set' | 'increase' | 'decrease'; value: number };
  }): Promise<{
    ok: number;
    failed: number;
    results: { id: string; title: string; ok: boolean; message?: string }[];
  }> {
    const { operation } = input;
    const ids = Array.from(new Set(input.productIds));
    if (operation.value < 0 || !Number.isFinite(operation.value)) {
      throw new BadRequestException('Value must be a non-negative number');
    }
    if (operation.kind === 'offer' && operation.mode === 'percent' && operation.value > 95) {
      throw new BadRequestException('Discount must be between 0 and 95%');
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { variants: { where: { isActive: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const results: { id: string; title: string; ok: boolean; message?: string }[] = [];
    for (const id of ids) {
      const product = byId.get(id);
      if (!product) {
        results.push({ id, title: id, ok: false, message: 'Product not found' });
        continue;
      }
      try {
        if (product.variants.length === 0) {
          throw new BadRequestException('Product has no variants');
        }
        if (operation.kind === 'stock') {
          const target = product.variants[0];
          const current = await this.inventory.getStock(target.id);
          const delta =
            operation.mode === 'set'
              ? operation.value - current
              : operation.mode === 'increase'
                ? operation.value
                : -operation.value;
          if (delta !== 0) {
            await this.inventory.adjust(target.id, delta, 'bulk-edit');
          }
        } else {
          const updates = product.variants.map((v) => {
            const next =
              operation.kind === 'price'
                ? operation.value
                : operation.mode === 'percent'
                  ? Math.round(v.mrp * (1 - operation.value / 100))
                  : Math.max(0, v.mrp - operation.value);
            if (next > v.mrp) {
              throw new BadRequestException(
                `Selling price (${next}) exceeds MRP (${v.mrp}) for SKU ${v.sku}`,
              );
            }
            return this.prisma.variant.update({
              where: { id: v.id },
              data: { sellingPrice: next },
            });
          });
          await this.prisma.$transaction(updates);
        }
        results.push({ id, title: product.title, ok: true });
      } catch (e) {
        results.push({
          id,
          title: product.title,
          ok: false,
          message: e instanceof Error ? e.message : 'Update failed',
        });
      }
    }
    const ok = results.filter((r) => r.ok).length;
    return { ok, failed: results.length - ok, results };
  }

  /** Hard-delete a product (cascades variants, inventory, images). */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Product not found');
    await this.prisma.product.delete({ where: { id } });
    return { deleted: true };
  }

  /** Update editable product fields (admin). Slug stays stable across renames. */
  async update(
    id: string,
    input: {
      title?: string;
      description?: string;
      categoryId?: string;
      brandId?: string | null;
      hsnCode?: string;
      taxRatePct?: number;
      isReturnable?: boolean;
      shgName?: string;
      story?: string;
      attributes?: Record<string, string>;
      seoTitle?: string;
      seoKeywords?: string;
      seoDescription?: string;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.brandId !== undefined) data.brandId = input.brandId || null;
    if (input.hsnCode !== undefined) data.hsnCode = input.hsnCode;
    if (input.taxRatePct !== undefined) data.taxRatePct = input.taxRatePct;
    if (input.isReturnable !== undefined) data.isReturnable = input.isReturnable;
    if (input.shgName !== undefined) data.shgName = input.shgName || null;
    if (input.story !== undefined) data.story = input.story || null;
    if (input.attributes !== undefined) data.attributesJson = input.attributes;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle || null;
    if (input.seoKeywords !== undefined) data.seoKeywords = input.seoKeywords || null;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription || null;
    return this.prisma.product.update({ where: { id }, data });
  }

  /** Replace a product's gallery images with the given ordered list. */
  async setImages(id: string, images: { url: string; alt?: string }[]) {
    await this.prisma.$transaction([
      this.prisma.productImage.deleteMany({ where: { productId: id } }),
      ...images.map((img, i) =>
        this.prisma.productImage.create({
          data: { productId: id, url: img.url, alt: img.alt ?? '', position: i },
        }),
      ),
    ]);
    return { count: images.length };
  }

  /** All products (any status) for the admin catalogue table. */
  async adminList() {
    const rows = await this.prisma.product.findMany({
      include: {
        images: { orderBy: { position: 'asc' }, take: 1 },
        variants: { where: { isActive: true } },
        brand: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // Need inventory for the dashboard stock totals.
    const variantIds = rows.flatMap((p) => p.variants.map((v) => v.id));
    const inv = await this.prisma.inventory.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, available: true },
    });
    const availById = new Map(inv.map((i) => [i.variantId, i.available]));
    return rows.map((p) => {
      const cheapest = p.variants.reduce(
        (min, cur) => (cur.sellingPrice < min.sellingPrice ? cur : min),
        p.variants[0] ?? { sellingPrice: 0, mrp: 0 },
      );
      const stock = p.variants.reduce((s, v) => s + (availById.get(v.id) ?? 0), 0);
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        brand: p.brand?.name ?? null,
        imageUrl: p.images[0]?.url ?? null,
        mrp: p.variants.length ? (cheapest as { mrp: number }).mrp : 0,
        sellingPrice: p.variants.length ? cheapest.sellingPrice : 0,
        variantCount: p.variants.length,
        stock,
        // Default variant so the table's Update Stock can target it directly.
        defaultVariantId: p.variants[0]?.id ?? null,
        // That variant's purchase limits (null = none) for the Update Stock dialog.
        minOrderQty: p.variants[0]?.minOrderQty ?? null,
        maxOrderQty: p.variants[0]?.maxOrderQty ?? null,
      };
    });
  }

  /** Full product detail (any status) for the admin editor. */
  async adminDetail(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: { where: { isActive: true }, include: { inventory: true } },
        brand: true,
      },
    });
    if (!p) throw new NotFoundException('Product not found');
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      categoryId: p.categoryId,
      brandId: p.brandId,
      hsnCode: p.hsnCode,
      taxRatePct: p.taxRatePct,
      status: p.status,
      isReturnable: p.isReturnable,
      shgName: p.shgName,
      story: p.story,
      attributes: (p.attributesJson as Record<string, string>) ?? {},
      seoTitle: p.seoTitle,
      seoKeywords: p.seoKeywords,
      seoDescription: p.seoDescription,
      images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
      variants: p.variants.map((vr) => ({
        id: vr.id,
        sku: vr.sku,
        mrp: vr.mrp,
        sellingPrice: vr.sellingPrice,
        attributes: (vr.attributesJson as Record<string, string>) ?? {},
        available: vr.inventory?.available ?? 0,
      })),
    };
  }

  /**
   * Bulk upsert from parsed CSV rows (FR-8.3). Returns per-row results so the
   * admin UI can show an error report. Validates the variant price invariant.
   *
   * New SKU: creates product + variant + inventory + images.
   * Existing SKU (edit via re-uploaded export): updates the variant's mrp and
   * sellingPrice, the product's title and category always, and description,
   * brand, hsnCode, taxRatePct, status and stock only when the cell is
   * provided (blank = unchanged). A non-empty imageUrls REPLACES the product's
   * images with exactly that ordered list; omitted/empty keeps them. Variants
   * of one product share product-level fields, so when several rows of the
   * same product disagree the last row wins. A SKU that belongs to a removed
   * (deactivated) variant is reactivated and updated like any existing SKU.
   *
   * @deprecated use POST /admin/products/bulk-v2 (Excel sheet)
   */
  async bulkUpsert(
    rows: Array<{
      sku: string;
      title: string;
      categorySlug: string;
      mrp: number;
      sellingPrice: number;
      description?: string;
      brand?: string;
      hsnCode?: string;
      taxRatePct?: number;
      stock?: number;
      status?: 'draft' | 'published';
      imageUrls?: string[];
    }>,
  ): Promise<{ ok: number; errors: { row: number; message: string }[] }> {
    const errors: { row: number; message: string }[] = [];
    let ok = 0;

    // Tolerant category resolution: an exact slug wins; otherwise match the
    // category NAME or SLUG ignoring case, punctuation and "&" vs "and" â€” so
    // "tea-coffee", "Tea & Coffee" and "tea-and-coffee" all resolve to the same
    // category. Names that exist in more than one branch (e.g. "Ghee") are
    // reported as ambiguous with the exact slugs to choose from.
    const normKey = normCategoryKey;
    let allCats: { id: string; name: string; slug: string }[] | null = null;
    const resolveCategory = async (input: string): Promise<{ id: string }> => {
      const raw = input.trim();
      const exact =
        (await this.prisma.category.findUnique({ where: { slug: raw } })) ??
        (raw !== raw.toLowerCase()
          ? await this.prisma.category.findUnique({ where: { slug: raw.toLowerCase() } })
          : null);
      if (exact) return exact;

      allCats ??= await this.prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
      });
      const key = normKey(raw);
      const matches = key
        ? allCats.filter((c) => normKey(c.slug) === key || normKey(c.name) === key)
        : [];
      if (matches.length === 1) return matches[0]!;
      if (matches.length > 1) {
        throw new Error(
          `category "${raw}" is ambiguous â€” use one of: ${matches.map((m) => m.slug).join(', ')}`,
        );
      }
      const hints = key
        ? allCats
            .filter((c) => {
              const k = normKey(c.slug);
              return k.length > 2 && (k.includes(key) || key.includes(k));
            })
            .slice(0, 3)
            .map((c) => c.slug)
        : [];
      throw new Error(
        `unknown category "${raw}"` + (hints.length ? ` â€” did you mean: ${hints.join(', ')}?` : ''),
      );
    };

    for (const [i, row] of rows.entries()) {
      try {
        if (row.mrp < 0 || row.sellingPrice < 0) throw new Error('prices must be non-negative');
        if (row.sellingPrice > row.mrp) throw new Error('sellingPrice exceeds mrp');

        // Validate image URLs up-front so a bad URL is reported per-row and no
        // product is written for that row.
        const imageUrls = row.imageUrls ?? [];
        for (const url of imageUrls) {
          if (!/^https?:\/\//.test(url) && !url.startsWith('/')) {
            throw new Error(`invalid image url "${url}"`);
          }
        }

        const category = await resolveCategory(row.categorySlug);

        const brandId = row.brand ? (await this.findOrCreateBrandByName(row.brand)).id : undefined;

        const existingVariant = await this.prisma.variant.findUnique({ where: { sku: row.sku } });

        if (existingVariant) {
          const productId = existingVariant.productId;
          // title + category are required CSV columns, so always applied;
          // optional cells only when provided (blank = unchanged).
          const productData: Record<string, unknown> = {
            title: row.title,
            categoryId: category.id,
          };
          if (row.description !== undefined) productData.description = row.description;
          if (row.hsnCode !== undefined) productData.hsnCode = row.hsnCode;
          if (row.taxRatePct !== undefined) productData.taxRatePct = row.taxRatePct;
          if (brandId !== undefined) productData.brandId = brandId;
          if (row.status !== undefined) productData.status = row.status;

          // A non-empty imageUrl list REPLACES the gallery in that order
          // (duplicates dropped, first = main); blank keeps current images.
          const replaceUrls = [...new Set(imageUrls)];

          await this.prisma.$transaction(async (tx) => {
            await tx.variant.update({
              where: { sku: row.sku },
              data: {
                mrp: row.mrp,
                sellingPrice: row.sellingPrice,
                // Re-uploading a removed variant's SKU restores it.
                ...(existingVariant.isActive === false ? { isActive: true } : {}),
              },
            });
            if (Object.keys(productData).length > 0) {
              await tx.product.update({ where: { id: productId }, data: productData });
            }
            if (row.stock !== undefined) {
              await tx.inventory.upsert({
                where: { variantId: existingVariant.id },
                create: { variantId: existingVariant.id, available: row.stock },
                update: { available: row.stock },
              });
            }
            if (replaceUrls.length > 0) {
              await tx.productImage.deleteMany({ where: { productId } });
              for (const [idx, url] of replaceUrls.entries()) {
                await tx.productImage.create({
                  data: { productId, url, alt: '', position: idx },
                });
              }
            }
          });
        } else {
          const slug = await this.uniqueSlug(row.title);
          await this.prisma.$transaction(async (tx) => {
            const product = await tx.product.create({
              data: {
                title: row.title,
                slug,
                categoryId: category.id,
                brandId,
                description: row.description ?? '',
                hsnCode: row.hsnCode ?? '',
                taxRatePct: row.taxRatePct ?? 0,
                isReturnable: true,
                status: row.status ?? 'published',
              },
            });
            const variant = await tx.variant.create({
              data: {
                productId: product.id,
                sku: row.sku,
                mrp: row.mrp,
                sellingPrice: row.sellingPrice,
              },
            });
            await tx.inventory.create({
              data: { variantId: variant.id, available: row.stock ?? 0 },
            });
            for (let idx = 0; idx < imageUrls.length; idx += 1) {
              await tx.productImage.create({
                data: { productId: product.id, url: imageUrls[idx], alt: '', position: idx },
              });
            }
          });
        }
        ok++;
      } catch (e) {
        errors.push({ row: i + 1, message: e instanceof Error ? e.message : 'unknown error' });
      }
    }
    return { ok, errors };
  }
}
