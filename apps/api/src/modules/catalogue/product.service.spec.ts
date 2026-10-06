import { ProductService } from './product.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CategoryService } from './category.service';

/**
 * Unit tests for ProductService.bulkUpsert error reporting (FR-8.3, BR-4).
 * Uses a minimal fake Prisma so the price-invariant and unknown-category
 * validation paths are exercised without a database.
 */
describe('ProductService.bulkUpsert', () => {
  interface FakeImage { productId: string; url: string; alt: string; position: number }
  interface FakeVariant { id: string; sku: string; productId: string; mrp: number; sellingPrice: number }
  interface FakeBrand { id: string; name: string; slug: string }

  function build(options: {
    existingVariants?: FakeVariant[];
    existingImages?: FakeImage[];
    existingBrands?: FakeBrand[];
  } = {}) {
    const products: Record<string, unknown>[] = [];
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

  it('updates price and appends a new image for an existing SKU without duplicating', async () => {
    const { svc, variants, images } = build({
      existingVariants: [{ id: 'v-ex', sku: 'EX1', productId: 'p-ex', mrp: 1000, sellingPrice: 900 }],
      existingImages: [{ productId: 'p-ex', url: 'https://cdn.test/old.jpg', alt: '', position: 0 }],
    });
    const res = await svc.bulkUpsert([
      {
        sku: 'EX1',
        title: 'Existing',
        categorySlug: 'apparel',
        mrp: 1200,
        sellingPrice: 1000,
        imageUrls: ['https://cdn.test/old.jpg', 'https://cdn.test/new.jpg'],
      },
    ]);
    expect(res.ok).toBe(1);
    const updated = variants.find((v) => v.sku === 'EX1');
    expect(updated?.sellingPrice).toBe(1000);
    expect(updated?.mrp).toBe(1200);
    // old.jpg not duplicated; new.jpg appended at the next position
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.url).sort()).toEqual([
      'https://cdn.test/new.jpg',
      'https://cdn.test/old.jpg',
    ]);
    expect(images.find((i) => i.url === 'https://cdn.test/new.jpg')?.position).toBe(1);
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
    return {
      id,
      title: `Product ${id}`,
      slug: id,
      ratingAvg: 0,
      ratingCount: 0,
      images: [],
      variants: [{ id: `${id}-v`, mrp: 1000, sellingPrice: 800 }],
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
});
