import { ProductService } from './product.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CategoryService } from './category.service';

/**
 * Unit tests for ProductService.bulkUpsert error reporting (FR-8.3, BR-4).
 * Uses a minimal fake Prisma so the price-invariant and unknown-category
 * validation paths are exercised without a database.
 */
describe('ProductService.bulkUpsert', () => {
  function build() {
    const created: unknown[] = [];
    const prisma = {
      category: { findUnique: async ({ where: { slug } }: { where: { slug: string } }) =>
        slug === 'apparel' ? { id: 'cat-apparel' } : null },
      variant: { findUnique: async () => null, create: async ({ data }: { data: unknown }) => ({ id: 'v1', ...(data as object) }) },
      product: { findUnique: async () => null, create: async ({ data }: { data: unknown }) => {
        created.push(data);
        return { id: 'p1', ...(data as object) };
      } },
      inventory: { create: async () => ({}) },
    } as unknown as PrismaService;
    const categories = {} as CategoryService;
    return { svc: new ProductService(prisma, categories), created };
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
