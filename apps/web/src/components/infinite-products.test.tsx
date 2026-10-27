import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductCardDto } from '@belzo/shared';
import { hasMoreProducts, mergeProducts, pageQuery } from '@/lib/infinite-products';
import { BRANDS_COLLAPSED, visibleBrands } from '@/lib/filter-state';
import { InfiniteProducts } from './infinite-products';

jest.mock('@/components/product-card', () => ({
  ProductCard: ({ product }: { product: { id: string; title: string } }) => <article data-testid="card">{product.title}</article>,
}));

const product = (n: number): ProductCardDto => ({ id: `p${n}`, title: `Product ${n}`, slug: `p-${n}` }) as unknown as ProductCardDto;
const many = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => product(from + i));

describe('infinite product helpers', () => {
  it('adds the next page and leaves out products already on screen', () => {
    const merged = mergeProducts(many(1, 3), [product(3), product(4)]);
    expect(merged.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
  it('has more only while fewer than the total are shown and the last page brought something', () => {
    expect(hasMoreProducts(20, 44, 20)).toBe(true);
    expect(hasMoreProducts(44, 44, 4)).toBe(false);
    expect(hasMoreProducts(20, 44, 0)).toBe(false);
    expect(hasMoreProducts(0, 0, 0)).toBe(false);
  });
  it('asks for a page while keeping the filters and the sort', () => {
    expect(pageQuery('categoryId=c1&sort=popularity&brandId=b1', 2)).toBe('categoryId=c1&sort=popularity&brandId=b1&page=2');
    expect(pageQuery('q=oil&page=1', 3)).toBe('q=oil&page=3');
  });
});

describe('InfiniteProducts', () => {
  const render = (items: ProductCardDto[], total: number) =>
    renderToStaticMarkup(
      <InfiniteProducts initial={{ items, total, page: 1, pageSize: 20 }} endpoint="products" query="categoryId=c1" testId="product-grid" />,
    );

  it('shows the first page and a way to load the rest when the category has more', () => {
    const html = render(many(1, 20), 44);
    expect(html.match(/data-testid="card"/g)).toHaveLength(20);
    expect(html).toContain('data-testid="plp-more"');
    expect(html).toContain('Load more products');
  });
  it('shows no load control when everything fits on the first page', () => {
    const html = render(many(1, 12), 12);
    expect(html.match(/data-testid="card"/g)).toHaveLength(12);
    expect(html).not.toContain('plp-more');
    expect(html).not.toContain('plp-end');
  });
});

describe('visibleBrands', () => {
  const brands = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, name: `Brand ${i}` }));
  it('shows the first few brands when collapsed', () => {
    expect(visibleBrands(brands, '', false).map((b) => b.id)).toEqual(brands.slice(0, BRANDS_COLLAPSED).map((b) => b.id));
  });
  it('shows every brand when expanded', () => {
    expect(visibleBrands(brands, '', true)).toHaveLength(30);
  });
  it('keeps the chosen brand visible by moving it to the front', () => {
    const out = visibleBrands(brands, 'b25', false);
    expect(out).toHaveLength(BRANDS_COLLAPSED);
    expect(out[0]!.id).toBe('b25');
  });
  it('shows everything when there are few brands', () => {
    expect(visibleBrands(brands.slice(0, 5), '', false)).toHaveLength(5);
  });
});
