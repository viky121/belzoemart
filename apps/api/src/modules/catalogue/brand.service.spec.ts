import 'reflect-metadata';
import { BrandService } from './brand.service';
import { CatalogueController } from './catalogue.controller';

/** The storefront brand filter: all brands, or only the brands of one category / one search. */
function make(descendants: string[] = ['c1', 'c1a']) {
  const prisma = { brand: { findMany: jest.fn(async () => [{ id: 'b1', name: 'Amul' }]) } };
  const categories = { descendantIds: jest.fn(async () => descendants) };
  return { svc: new BrandService(prisma as never, categories as never), prisma, categories };
}

describe('BrandService.list', () => {
  it('lists every active brand when no filter is given', async () => {
    const { svc, prisma, categories } = make();
    await svc.list();
    expect(prisma.brand.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: 'asc' } });
    expect(categories.descendantIds).not.toHaveBeenCalled();
  });

  it('keeps only brands that have a published product on sale in the category and the categories below it', async () => {
    const { svc, prisma, categories } = make(['c1', 'c1a', 'c1b']);
    await svc.list({ categoryId: 'c1' });
    expect(categories.descendantIds).toHaveBeenCalledWith('c1');
    expect(prisma.brand.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        products: {
          some: { status: 'published', variants: { some: { isActive: true } }, categoryId: { in: ['c1', 'c1a', 'c1b'] } },
        },
      },
      orderBy: { name: 'asc' },
    });
  });

  it('keeps only brands that have a product matching the search words', async () => {
    const { svc, prisma } = make();
    await svc.list({ q: '  oil ' });
    const where = (prisma.brand.findMany.mock.calls[0] as unknown as [{ where: { products: { some: Record<string, unknown> } } }])[0].where;
    expect(where.products.some.OR).toEqual([
      { title: { contains: 'oil', mode: 'insensitive' } },
      { description: { contains: 'oil', mode: 'insensitive' } },
    ]);
    expect(where.products.some.status).toBe('published');
  });

  it('treats a blank search as no filter', async () => {
    const { svc, prisma } = make();
    await svc.list({ q: '   ' });
    expect(prisma.brand.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: 'asc' } });
  });
});

describe('CatalogueController GET brands', () => {
  const list = jest.fn(async () => []);
  const ctrl = new CatalogueController({} as never, {} as never, { list } as never, {} as never, {} as never);
  beforeEach(() => list.mockClear());
  const id = '11111111-1111-4111-8111-111111111111';

  it('passes the category and the search words to the service', async () => {
    await ctrl.brandList({ categoryId: id, q: ' oil ' });
    expect(list).toHaveBeenCalledWith({ categoryId: id, q: 'oil' });
  });
  it('lists everything without a query', async () => {
    await ctrl.brandList({});
    expect(list).toHaveBeenCalledWith({});
  });
  it('refuses a category id that is not an id', () => {
    expect(() => ctrl.brandList({ categoryId: 'x; drop table' })).toThrow();
    expect(list).not.toHaveBeenCalled();
  });
});
