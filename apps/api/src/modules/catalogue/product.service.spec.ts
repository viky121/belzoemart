import { ProductService, toExportRows } from './product.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CategoryService } from './category.service';

/**
 * Unit tests for ProductService.bulkUpsert error reporting (FR-8.3, BR-4).
 * Uses a minimal fake Prisma so the price-invariant and unknown-category
 * validation paths are exercised without a database.
 */
describe('ProductService.bulkUpsert', () => {
  interface FakeImage { productId: string; url: string; alt: string; position: number }
  interface FakeVariant {
    id: string;
    sku: string;
    productId: string;
    mrp: number;
    sellingPrice: number;
    isActive?: boolean;
  }
  interface FakeBrand { id: string; name: string; slug: string }

  function build(options: {
    existingVariants?: FakeVariant[];
    existingImages?: FakeImage[];
    existingBrands?: FakeBrand[];
    existingProducts?: Record<string, unknown>[];
  } = {}) {
    const products: Record<string, unknown>[] = [...(options.existingProducts ?? [])];
    const variants: FakeVariant[] = [...(options.existingVariants ?? [])];
    const images: FakeImage[] = [...(options.existingImages ?? [])];
    const brands: FakeBrand[] = [...(options.existingBrands ?? [])];
    const inventory: { variantId: string; available: number }[] = [];
    let pSeq = 0;
    let vSeq = variants.length;
    let bSeq = brands.length;

    const prisma = {
      $transaction: async (fn: (tx: PrismaService) => Promise<unknown>) =>
        fn(prisma as unknown as PrismaService),
      category: {
        findUnique: async ({ where: { slug } }: { where: { slug: string } }) =>
          slug === 'apparel' ? { id: 'cat-apparel' } : null,
        findMany: async () => [
          { id: 'cat-apparel', name: 'Apparel', slug: 'apparel' },
          { id: 'cat-tea', name: 'Tea & Coffee', slug: 'tea-and-coffee' },
          { id: 'cat-ghee-1', name: 'Ghee', slug: 'ghee' },
          { id: 'cat-ghee-2', name: 'Ghee', slug: 'ghee-2' },
        ],
      },
      brand: {
        findFirst: async ({ where }: { where: { name: { equals: string } } }) =>
          brands.find((b) => b.name.toLowerCase() === where.name.equals.toLowerCase()) ?? null,
        findUnique: async ({ where: { slug } }: { where: { slug: string } }) =>
          brands.find((b) => b.slug === slug) ?? null,
        create: async ({ data }: { data: { name: string; slug: string } }) => {
          const b = { id: `b${(bSeq += 1)}`, ...data };
          brands.push(b);
          return b;
        },
      },
      variant: {
        findUnique: async ({ where: { sku } }: { where: { sku: string } }) =>
          variants.find((v) => v.sku === sku) ?? null,
        create: async ({ data }: { data: Omit<FakeVariant, 'id'> }) => {
          const v = { id: `v${(vSeq += 1)}`, ...data };
          variants.push(v);
          return v;
        },
        update: async ({ where: { sku }, data }: { where: { sku: string }; data: Partial<FakeVariant> }) => {
          const v = variants.find((x) => x.sku === sku)!;
          Object.assign(v, data);
          return v;
        },
      },
      product: {
        findUnique: async ({ where: { slug } }: { where: { slug?: string } }) =>
          slug ? (products.find((p) => p.slug === slug) ?? null) : null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const p = { id: `p${(pSeq += 1)}`, ...data };
          products.push(p);
          return p;
        },
        update: async ({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const p = products.find((x) => x.id === id);
          if (p) Object.assign(p, data);
          return p ?? { id, ...data };
        },
      },
      productImage: {
        findMany: async ({ where: { productId } }: { where: { productId: string } }) =>
          images
            .filter((img) => img.productId === productId)
            .sort((a, b) => b.position - a.position),
        create: async ({ data }: { data: FakeImage }) => {
          images.push(data);
          return data;
        },
        deleteMany: async ({ where: { productId } }: { where: { productId: string } }) => {
          let count = 0;
          for (let i = images.length - 1; i >= 0; i -= 1) {
            if (images[i]!.productId === productId) {
              images.splice(i, 1);
              count += 1;
            }
          }
          return { count };
        },
      },
      inventory: {
        create: async ({ data }: { data: { variantId: string; available: number } }) => {
          inventory.push(data);
          return data;
        },
        upsert: async ({ where, create, update }: {
          where: { variantId: string };
          create: { variantId: string; available: number };
          update: { available: number };
        }) => {
          const existing = inventory.find((inv) => inv.variantId === where.variantId);
          if (existing) {
            existing.available = update.available;
            return existing;
          }
          inventory.push(create);
          return create;
        },
      },
    };
    const categories = {} as CategoryService;
    return {
      svc: new ProductService(prisma as unknown as PrismaService, categories),
      products,
      variants,
      images,
      brands,
      inventory,
    };
  }

  it('rejects a row where sellingPrice exceeds mrp', async () => {
    const { svc } = build();
    const res = await svc.bulkUpsert([
      { sku: 'A1', title: 'Valid', categorySlug: 'apparel', mrp: 1000, sellingPrice: 800 },
      { sku: 'B2', title: 'Bad price', categorySlug: 'apparel', mrp: 1000, sellingPrice: 1500 },
    ]);
    expect(res.ok).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toMatchObject({ row: 2 });
    expect(res.errors[0]?.message).toMatch(/exceeds mrp/);
  });

  it('reports unknown category as an error row', async () => {
    const { svc } = build();
    const res = await svc.bulkUpsert([
      { sku: 'C3', title: 'No cat', categorySlug: 'nonexistent', mrp: 500, sellingPrice: 400 },
    ]);
    expect(res.ok).toBe(0);
    expect(res.errors[0]?.message).toMatch(/unknown category/);
  });

  it('resolves near-miss category slugs and names (tea-coffee / Tea & Coffee)', async () => {
    const { svc, products } = build();
    const res = await svc.bulkUpsert([
      { sku: 'T1', title: 'Tea A', categorySlug: 'tea-coffee', mrp: 1000, sellingPrice: 800 },
      { sku: 'T2', title: 'Tea B', categorySlug: 'Tea & Coffee', mrp: 1000, sellingPrice: 800 },
    ]);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(2);
    expect(products.every((p) => p.categoryId === 'cat-tea')).toBe(true);
  });

  it('reports an ambiguous category name with the exact slugs to choose from', async () => {
    const { svc } = build();
    const res = await svc.bulkUpsert([
      { sku: 'G1', title: 'Ghee pack', categorySlug: 'GHEE ', mrp: 1000, sellingPrice: 800 },
    ]);
    // "ghee" exact slug misses (fake only knows 'apparel'), name matches twice
    expect(res.ok).toBe(0);
    expect(res.errors[0]?.message).toMatch(/ambiguous.*ghee, ghee-2/);
  });

  it('attaches ProductImage rows in order for a new SKU', async () => {
    const { svc, images } = build();
    const res = await svc.bulkUpsert([
      {
        sku: 'IMG1',
        title: 'Has images',
        categorySlug: 'apparel',
        mrp: 1000,
        sellingPrice: 800,
        imageUrls: ['https://cdn.test/a.jpg', '/local/b.png'],
      },
    ]);
    expect(res.ok).toBe(1);
    expect(images).toHaveLength(2);
    expect(images.map((i) => [i.url, i.position])).toEqual([
      ['https://cdn.test/a.jpg', 0],
      ['/local/b.png', 1],
    ]);
  });

  it('creates Inventory with available = stock for a new SKU', async () => {
    const { svc, inventory } = build();
    const res = await svc.bulkUpsert([
      { sku: 'STK1', title: 'Stocked', categorySlug: 'apparel', mrp: 1000, sellingPrice: 800, stock: 42 },
    ]);
    expect(res.ok).toBe(1);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]?.available).toBe(42);
  });

  it('find-or-creates a brand by name (reuses existing id, creates when missing)', async () => {
    const existing = build({ existingBrands: [{ id: 'b-known', name: 'Acme', slug: 'acme' }] });
    const resFound = await existing.svc.bulkUpsert([
      { sku: 'BR1', title: 'Branded', categorySlug: 'apparel', mrp: 1000, sellingPrice: 800, brand: 'acme' },
    ]);
    expect(resFound.ok).toBe(1);
    expect(existing.brands).toHaveLength(1); // no new brand created (case-insensitive match)
    expect(existing.products[0]?.brandId).toBe('b-known');

    const fresh = build();
    const resCreate = await fresh.svc.bulkUpsert([
      { sku: 'BR2', title: 'New brand', categorySlug: 'apparel', mrp: 1000, sellingPrice: 800, brand: 'Fresh Co' },
    ]);
    expect(resCreate.ok).toBe(1);
    expect(fresh.brands).toHaveLength(1);
    expect(fresh.brands[0]?.slug).toBe('fresh-co');
    expect(fresh.products[0]?.brandId).toBe(fresh.brands[0]?.id);
  });

  it('publishes new SKUs by default and honours an explicit status', async () => {
    const { svc, products } = build();
    await svc.bulkUpsert([
      { sku: 'PUB1', title: 'Default status', categorySlug: 'apparel', mrp: 1000, sellingPrice: 800 },
      { sku: 'DRF1', title: 'Draft', categorySlug: 'apparel', mrp: 1000, sellingPrice: 800, status: 'draft' },
    ]);
    expect(products[0]?.status).toBe('published');
    expect(products[1]?.status).toBe('draft');
  });

  it('reports an invalid image url as a row error without creating a product', async () => {
    const { svc, products } = build();
    const res = await svc.bulkUpsert([
      {
        sku: 'BAD1',
        title: 'Bad image',
        categorySlug: 'apparel',
        mrp: 1000,
        sellingPrice: 800,
        imageUrls: ['ftp://nope/x.jpg'],
      },
    ]);
    expect(res.ok).toBe(0);
    expect(res.errors[0]?.message).toMatch(/invalid image url/);
    expect(products).toHaveLength(0);
  });

  describe('existing SKU edits', () => {
    const exVariant = (): FakeVariant => ({
      id: 'v-ex',
      sku: 'EX1',
      productId: 'p-ex',
      mrp: 1000,
      sellingPrice: 900,
    });
    const exProduct = (): Record<string, unknown> => ({
      id: 'p-ex',
      title: 'Old',
      slug: 'old',
      categoryId: 'cat-apparel',
      description: 'Old description',
    });
    const exImages = (): FakeImage[] => [
      { productId: 'p-ex', url: 'https://cdn.test/old.jpg', alt: '', position: 0 },
      { productId: 'p-ex', url: 'https://cdn.test/keep.jpg', alt: '', position: 1 },
    ];
    const byPosition = (images: FakeImage[]) =>
      images
        .filter((i) => i.productId === 'p-ex')
        .sort((a, b) => a.position - b.position)
        .map((i) => [i.url, i.position]);

    it('updates mrp/sellingPrice, title and category', async () => {
      const { svc, variants, products } = build({
        existingVariants: [exVariant()],
        existingProducts: [exProduct()],
      });
      const res = await svc.bulkUpsert([
        { sku: 'EX1', title: 'New title', categorySlug: 'Tea & Coffee', mrp: 1200, sellingPrice: 1000 },
      ]);
      expect(res.errors).toEqual([]);
      expect(res.ok).toBe(1);
      const updated = variants.find((v) => v.sku === 'EX1');
      expect(updated?.mrp).toBe(1200);
      expect(updated?.sellingPrice).toBe(1000);
      expect(products[0]?.categoryId).toBe('cat-tea');
      expect(products[0]?.title).toBe('New title');
      // blank optional cells leave the current value unchanged
      expect(products[0]?.description).toBe('Old description');
    });

    it('replaces images in order when imageUrls is non-empty', async () => {
      const { svc, images } = build({
        existingVariants: [exVariant()],
        existingProducts: [exProduct()],
        existingImages: exImages(),
      });
      const res = await svc.bulkUpsert([
        {
          sku: 'EX1',
          title: 'Old',
          categorySlug: 'apparel',
          mrp: 1000,
          sellingPrice: 900,
          imageUrls: ['https://cdn.test/new.jpg', 'https://cdn.test/keep.jpg'],
        },
      ]);
      expect(res.ok).toBe(1);
      expect(byPosition(images)).toEqual([
        ['https://cdn.test/new.jpg', 0],
        ['https://cdn.test/keep.jpg', 1],
      ]);
      expect(images.some((i) => i.url === 'https://cdn.test/old.jpg')).toBe(false);
    });

    it('keeps existing images exactly when imageUrls is omitted', async () => {
      const { svc, images } = build({
        existingVariants: [exVariant()],
        existingProducts: [exProduct()],
        existingImages: exImages(),
      });
      const res = await svc.bulkUpsert([
        { sku: 'EX1', title: 'Old', categorySlug: 'apparel', mrp: 1100, sellingPrice: 950 },
      ]);
      expect(res.ok).toBe(1);
      expect(images).toEqual(exImages());
    });

    it('leaves everything identical for an unchanged round trip', async () => {
      const { svc, images, variants, products } = build({
        existingVariants: [exVariant()],
        existingProducts: [exProduct()],
        existingImages: exImages(),
      });
      const res = await svc.bulkUpsert([
        {
          sku: 'EX1',
          title: 'Old',
          categorySlug: 'apparel',
          mrp: 1000,
          sellingPrice: 900,
          description: 'Old description',
          imageUrls: ['https://cdn.test/old.jpg', 'https://cdn.test/keep.jpg'],
        },
      ]);
      expect(res.ok).toBe(1);
      expect(byPosition(images)).toEqual(byPosition(exImages()));
      expect(variants).toEqual([exVariant()]);
      expect(products).toEqual([exProduct()]);
    });

    it('reactivates a soft-deleted (removed) SKU and applies the row', async () => {
      const { svc, variants, inventory } = build({
        existingVariants: [{ ...exVariant(), isActive: false }],
        existingProducts: [exProduct()],
      });
      const res = await svc.bulkUpsert([
        { sku: 'EX1', title: 'Old', categorySlug: 'apparel', mrp: 1500, sellingPrice: 1200, stock: 9 },
      ]);
      expect(res.errors).toEqual([]);
      expect(res.ok).toBe(1);
      expect(variants).toHaveLength(1); // updated in place, no duplicate SKU created
      expect(variants[0]).toMatchObject({ isActive: true, mrp: 1500, sellingPrice: 1200 });
      expect(inventory).toEqual([{ variantId: 'v-ex', available: 9 }]);
    });

    it('does not touch isActive for an active existing SKU', async () => {
      const { svc, variants } = build({
        existingVariants: [{ ...exVariant(), isActive: true }],
        existingProducts: [exProduct()],
      });
      await svc.bulkUpsert([
        { sku: 'EX1', title: 'Old', categorySlug: 'apparel', mrp: 1000, sellingPrice: 900 },
      ]);
      expect(variants[0]?.isActive).toBe(true);
    });
  });
});

/** Pure CSV-export mapping (paise -> rupees, one row per variant). */
describe('toExportRows', () => {
  function product(overrides: Partial<Parameters<typeof toExportRows>[0]> = {}) {
    return {
      title: 'Basmati Rice',
      description: 'Premium, "aged"',
      hsnCode: '1006',
      taxRatePct: 5,
      status: 'published' as const,
      category: { slug: 'rice' },
      brand: { name: 'Belzo' },
      images: [
        { url: '/uploads/b.jpg', position: 1 },
        { url: 'https://cdn.test/a.jpg', position: 0 },
      ],
      variants: [
        { sku: 'RICE-5KG', mrp: 89900, sellingPrice: 79950, inventory: { available: 12 } },
      ],
      ...overrides,
    };
  }

  it('converts paise to rupees and joins images by position', () => {
    const [row] = toExportRows(product());
    expect(row).toEqual({
      sku: 'RICE-5KG',
      title: 'Basmati Rice',
      categorySlug: 'rice',
      mrp: 899,
      sellingPrice: 799.5,
      description: 'Premium, "aged"',
      brand: 'Belzo',
      hsnCode: '1006',
      taxRatePct: 5,
      stock: 12,
      status: 'published',
      imageUrl: 'https://cdn.test/a.jpg|/uploads/b.jpg',
    });
  });

  it('yields one row per variant sharing product-level fields', () => {
    const rows = toExportRows(
      product({
        variants: [
          { sku: 'R-1', mrp: 10000, sellingPrice: 9000, inventory: { available: 3 } },
          { sku: 'R-5', mrp: 45000, sellingPrice: 40000, inventory: { available: 7 } },
        ],
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.sku, r.mrp, r.sellingPrice, r.stock])).toEqual([
      ['R-1', 100, 90, 3],
      ['R-5', 450, 400, 7],
    ]);
    for (const r of rows) {
      expect(r.title).toBe('Basmati Rice');
      expect(r.categorySlug).toBe('rice');
      expect(r.brand).toBe('Belzo');
      expect(r.imageUrl).toBe('https://cdn.test/a.jpg|/uploads/b.jpg');
    }
  });

  it('uses stock 0 for null inventory and empty brand for null brand', () => {
    const [row] = toExportRows(
      product({
        brand: null,
        variants: [{ sku: 'X', mrp: 100, sellingPrice: 100, inventory: null }],
      }),
    );
    expect(row?.stock).toBe(0);
    expect(row?.brand).toBe('');
  });

  it('returns no rows for a product without variants', () => {
    expect(toExportRows(product({ variants: [] }))).toEqual([]);
  });
});

describe('ProductService.exportRows', () => {
  it('queries draft+published only and maps each product to rows', async () => {
    const fixture = {
      id: 'p1',
      title: 'Tea',
      description: '',
      hsnCode: '0902',
      taxRatePct: 5,
      status: 'draft' as const,
      category: { slug: 'green-tea' },
      brand: null,
      images: [{ url: '/uploads/t.jpg', position: 0 }],
      variants: [{ sku: 'TEA-1', mrp: 25000, sellingPrice: 20000, inventory: { available: 4 } }],
    };
    type Args = {
      where: { status: { in: string[] } };
      include: { variants: { where: unknown } };
    };
    const calls: Args[] = [];
    const prisma = {
      product: {
        findMany: async (args: Args) => {
          calls.push(args);
          return [fixture];
        },
      },
    } as unknown as PrismaService;
    const svc = new ProductService(prisma, {} as CategoryService);
    const res = await svc.exportRows();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.where.status.in).toEqual(['draft', 'published']);
    // Removed (deactivated) variants are not exported.
    expect(calls[0]?.include.variants.where).toEqual({ isActive: true });
    expect(res).toEqual({ rows: toExportRows(fixture) });
  });
});

describe('ProductService.adminList', () => {
  it('counts only active variants for price, stock and variant count', async () => {
    const calls: { include: { variants: unknown } }[] = [];
    const prisma = {
      product: {
        findMany: async (args: { include: { variants: unknown } }) => {
          calls.push(args);
          return [
            {
              id: 'p1',
              title: 'Oil',
              slug: 'oil',
              status: 'published',
              brand: null,
              images: [],
              variants: [
                { id: 'v200', mrp: 300, sellingPrice: 250 },
                { id: 'v1000', mrp: 1200, sellingPrice: 1000 },
              ],
            },
          ];
        },
      },
      inventory: {
        findMany: async () => [
          { variantId: 'v200', available: 4 },
          { variantId: 'v1000', available: 6 },
        ],
      },
    } as unknown as PrismaService;
    const svc = new ProductService(prisma, {} as CategoryService);
    const [row] = await svc.adminList();
    expect(calls[0]?.include.variants).toEqual({ where: { isActive: true } });
    expect(row).toMatchObject({ variantCount: 2, stock: 10, sellingPrice: 250 });
  });
});

describe('ProductService.list — paginated', () => {
  it('prices cards from active variants and hides products with none (where + count)', async () => {
    const calls: { findMany: { where: unknown; include: { variants: unknown } }[]; count: unknown[] } = {
      findMany: [],
      count: [],
    };
    const prisma = {
      product: {
        findMany: async (args: { where: unknown; include: { variants: unknown } }) => {
          calls.findMany.push(args);
          return [
            {
              id: 'a',
              title: 'A',
              slug: 'a',
              ratingAvg: 0,
              ratingCount: 0,
              images: [],
              variants: [
                { id: 'a-cheap', mrp: 500, sellingPrice: 300, isActive: false },
                { id: 'a-v', mrp: 1000, sellingPrice: 800, isActive: true },
              ],
            },
          ];
        },
        count: async (args: unknown) => {
          calls.count.push(args);
          return 1;
        },
      },
    } as unknown as PrismaService;
    const svc = new ProductService(prisma, {} as CategoryService);
    const res = await svc.list({ sort: 'relevance', page: 1, pageSize: 20 } as never);
    expect(res.items[0]).toMatchObject({ sellingPrice: 800, mrp: 1000, defaultVariantId: 'a-v' });
    expect(calls.findMany[0]?.where).toMatchObject({
      status: 'published',
      variants: { some: { isActive: true } },
    });
    expect(calls.findMany[0]?.include.variants).toEqual({ where: { isActive: true } });
    expect(calls.count[0]).toEqual({ where: calls.findMany[0]?.where });
  });
});

/**
 * Unit tests for the "by ids" branch of ProductService.list (manual home-page
 * rails). A fake Prisma records the findMany args and returns a fixed set of
 * published product rows so order/truncation/short-circuit behaviour is
 * exercised without a database.
 */
describe('ProductService.list — ids branch', () => {
  function row(id: string) {
    const variants: { id: string; mrp: number; sellingPrice: number; isActive?: boolean }[] = [
      { id: `${id}-v`, mrp: 1000, sellingPrice: 800 },
    ];
    return {
      id,
      title: `Product ${id}`,
      slug: id,
      ratingAvg: 0,
      ratingCount: 0,
      images: [],
      variants,
    };
  }

  function build(rows: ReturnType<typeof row>[]) {
    const calls: { findMany: unknown[] } = { findMany: [] };
    const prisma = {
      product: {
        findMany: async (args: { where?: { id?: { in?: string[] } } }) => {
          calls.findMany.push(args);
          const wanted = args.where?.id?.in ?? [];
          return rows.filter((r) => wanted.includes(r.id));
        },
        count: async () => {
          throw new Error('count must not be called in the ids branch');
        },
      },
    } as unknown as PrismaService;
    const categories = {} as CategoryService;
    return { svc: new ProductService(prisma, categories), calls };
  }

  it('returns only matching published products in the requested id order', async () => {
    const { svc } = build([row('a'), row('b'), row('c')]);
    const res = await svc.list({ ids: 'c,a,b', sort: 'relevance', page: 1, pageSize: 20 } as never);
    expect(res.items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(res.total).toBe(3);
    expect(res.page).toBe(1);
  });

  it('drops absent/unpublished ids', async () => {
    const { svc } = build([row('a'), row('c')]); // 'b' not returned by Prisma
    const res = await svc.list({ ids: 'a,b,c', sort: 'relevance', page: 1, pageSize: 20 } as never);
    expect(res.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(res.total).toBe(2);
  });

  it('truncates to the first pageSize in picked order', async () => {
    const { svc } = build([row('a'), row('b'), row('c')]);
    const res = await svc.list({ ids: 'c,b,a', sort: 'relevance', page: 1, pageSize: 2 } as never);
    expect(res.items.map((i) => i.id)).toEqual(['c', 'b']);
    expect(res.total).toBe(2);
  });

  it('short-circuits a blank ids string without building an id clause', async () => {
    const { svc, calls } = build([row('a')]);
    const res = await svc.list({ ids: ' , ', sort: 'relevance', page: 1, pageSize: 20 } as never);
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
    expect(calls.findMany).toHaveLength(0);
  });

  it('ignores removed (inactive) variants for the card price and filters them in the query', async () => {
    const { svc, calls } = build([
      {
        ...row('x'),
        variants: [
          { id: 'x-cheap', mrp: 500, sellingPrice: 300, isActive: false },
          { id: 'x-v', mrp: 1000, sellingPrice: 800, isActive: true },
        ],
      },
    ]);
    const res = await svc.list({ ids: 'x', sort: 'relevance', page: 1, pageSize: 20 } as never);
    expect(res.items[0]).toMatchObject({ sellingPrice: 800, defaultVariantId: 'x-v' });
    const args = calls.findMany[0] as {
      where: { variants: unknown };
      include: { variants: unknown };
    };
    expect(args.where.variants).toEqual({ some: { isActive: true } });
    expect(args.include.variants).toEqual({ where: { isActive: true } });
  });
});
