import { renderToStaticMarkup } from 'react-dom/server';
import CategoryPage from './page';

const category = (over: Record<string, unknown>) => ({
  id: 'c1',
  name: 'Stationery',
  slug: 'stationery',
  imageUrl: null,
  children: [],
  ...over,
});

const mockCategories = jest.fn();
jest.mock('@/lib/catalogue-api', () => ({
  catalogueApi: {
    categories: () => mockCategories(),
    brands: jest.fn().mockResolvedValue([]),
    products: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  },
}));
jest.mock('@/components/filter-sidebar', () => ({ FilterSidebar: () => null }));
jest.mock('@/components/infinite-products', () => ({ InfiniteProducts: () => null }));

async function band(slug: string) {
  const page = await CategoryPage({ params: { slug }, searchParams: {} });
  const html = renderToStaticMarkup(page);
  return /<div class="plp-band">.*?<\/span>/s.exec(html)?.[0] ?? '';
}

describe('Category page header icon', () => {
  it('shows the same picture the home page shows for the category', async () => {
    mockCategories.mockResolvedValue([category({ imageUrl: '/api/uploads/categories/stationery.png' })]);
    const html = await band('stationery');
    expect(html).toContain('data-testid="category-band-image"');
    expect(html).toContain('<img src="/api/uploads/categories/stationery.png"');
    expect(html).not.toContain('linear-gradient');
  });

  it('falls back to the emoji tile when the category has no picture', async () => {
    mockCategories.mockResolvedValue([category({ imageUrl: null })]);
    const html = await band('stationery');
    expect(html).not.toContain('category-band-image');
    expect(html).not.toContain('<img');
    expect(html).toContain('linear-gradient');
  });

  it('treats a seed placeholder picture as "no picture", like the home page does', async () => {
    mockCategories.mockResolvedValue([category({ imageUrl: '/seed/stationery.png' })]);
    const html = await band('stationery');
    expect(html).not.toContain('<img');
  });

  it('finds the picture of a sub-category too', async () => {
    mockCategories.mockResolvedValue([
      category({ children: [category({ id: 'c2', name: 'Pens', slug: 'pens', imageUrl: '/api/uploads/categories/pens.png' })] }),
    ]);
    expect(await band('pens')).toContain('<img src="/api/uploads/categories/pens.png"');
  });

  it('a sub-category with no picture of its own shows the one from the category above it', async () => {
    mockCategories.mockResolvedValue([
      category({
        imageUrl: '/api/uploads/categories/stationery.png',
        children: [category({ id: 'c2', name: 'Pens', slug: 'pens', imageUrl: null })],
      }),
    ]);
    const html = await band('pens');
    expect(html).toContain('<img src="/api/uploads/categories/stationery.png"');
    expect(html).not.toContain('linear-gradient');
  });

  it('prefers the sub-category\'s own picture over the one above it', async () => {
    mockCategories.mockResolvedValue([
      category({
        imageUrl: '/api/uploads/categories/stationery.png',
        children: [category({ id: 'c2', name: 'Pens', slug: 'pens', imageUrl: '/api/uploads/categories/pens.png' })],
      }),
    ]);
    expect(await band('pens')).toContain('/api/uploads/categories/pens.png');
  });

  it('sub-category chips without a picture show the picture of the category they sit under', async () => {
    mockCategories.mockResolvedValue([
      category({
        imageUrl: '/api/uploads/categories/stationery.png',
        children: [
          category({ id: 'c2', name: 'Pens', slug: 'pens', imageUrl: null }),
          category({ id: 'c3', name: 'Gum', slug: 'gum', imageUrl: '/api/uploads/categories/gum.png' }),
        ],
      }),
    ]);
    const page = await CategoryPage({ params: { slug: 'stationery' }, searchParams: {} });
    const chips = /data-testid="subcategories">(.*?)<\/div>/s.exec(renderToStaticMarkup(page))?.[1] ?? '';
    expect(chips).toContain('<img src="/api/uploads/categories/stationery.png"'); // Pens: from above
    expect(chips).toContain('<img src="/api/uploads/categories/gum.png"'); // Gum: its own
  });

  it('does not break for a category that does not exist', async () => {
    mockCategories.mockResolvedValue([]);
    const html = await band('nope');
    expect(html).toContain('plp-band__icon');
    expect(html).not.toContain('<img');
  });
});
