import { PostgresSearchProvider } from './postgres-search.provider';
import type { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Search cards must never be priced from a removed (deactivated) variant, and
 * published products with no active variant are excluded from the query.
 */
describe('PostgresSearchProvider.search', () => {
  function build(rows: unknown[]) {
    const calls: { findMany: { where: unknown; include: { variants: unknown } }[]; count: unknown[] } = {
      findMany: [],
      count: [],
    };
    const prisma = {
      product: {
        findMany: async (args: { where: unknown; include: { variants: unknown } }) => {
          calls.findMany.push(args);
          return rows;
        },
        count: async (args: unknown) => {
          calls.count.push(args);
          return rows.length;
        },
      },
    } as unknown as PrismaService;
    return { provider: new PostgresSearchProvider(prisma), calls };
  }

  it('prices the card from active variants only', async () => {
    const { provider } = build([
      {
        id: 'p1',
        title: 'Mustard Oil',
        slug: 'mustard-oil',
        ratingAvg: 0,
        ratingCount: 0,
        images: [],
        variants: [
          { id: 'v200', mrp: 500, sellingPrice: 300, isActive: false, attributesJson: { Size: '200 ml' } },
          { id: 'v1000', mrp: 1200, sellingPrice: 1000, isActive: true, attributesJson: { Size: '1 L' } },
        ],
      },
    ]);
    const res = await provider.search({ q: 'oil', sort: 'relevance', page: 1, pageSize: 20 } as never);
    expect(res.items[0]).toMatchObject({
      sellingPrice: 1000,
      mrp: 1200,
      defaultVariantId: 'v1000',
      unit: '1 L',
    });
  });

  it('filters products and included variants to active ones (query + count)', async () => {
    const { provider, calls } = build([]);
    await provider.search({ q: 'oil', sort: 'relevance', page: 1, pageSize: 20 } as never);
    expect(calls.findMany[0]?.where).toMatchObject({
      status: 'published',
      variants: { some: { isActive: true } },
    });
    expect(calls.findMany[0]?.include.variants).toEqual({ where: { isActive: true } });
    expect(calls.count[0]).toEqual({ where: calls.findMany[0]?.where });
  });
});
