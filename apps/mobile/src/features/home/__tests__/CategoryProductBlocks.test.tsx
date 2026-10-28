import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { CategoryProductBlock, flattenUnique } from '../components/CategoryProductBlocks';

// The test phone reports a font scale of 2, which would give two columns: pin three here.
jest.mock('@/ui/use-grid-columns', () => ({ ...jest.requireActual('@/ui/use-grid-columns'), useGridColumns: () => 3 }));

/** A category on the home page: six products and, only while there are more, a See more button. */
const node = { id: 'c1', name: 'Stationery', slug: 'stationery', parentId: null, imageUrl: null, children: [] } as unknown as CategoryNodeDto;
const tile: MobileCategoryTile = { id: 'c1', name: 'Stationery', iconUrl: null, node };

let total = 0;
let failing = false;
function product(n: number) {
  return {
    id: `p${n}`, title: `Product ${n}`, slug: `p${n}`, imageUrl: null, mrp: 10000, sellingPrice: 8000, discountPct: 20,
    ratingAvg: 4, ratingCount: 1, defaultVariantId: `v${n}`, unit: '1 pc',
  };
}
beforeEach(() => {
  failing = false;
  globalThis.fetch = jest.fn((url: string) => {
    const q = new URL(url).searchParams;
    const page = Number(q.get('page') ?? 1);
    const size = Number(q.get('pageSize') ?? 20);
    const items = Array.from({ length: total }, (_, i) => product(i + 1)).slice((page - 1) * size, page * size);
    return Promise.resolve({
      ok: !failing,
      status: failing ? 500 : 200,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(failing ? { error: 'ServerError', message: 'boom' } : { items, total, page, pageSize: size })),
    });
  }) as unknown as typeof fetch;
});

const block = () => (
  <CategoryProductBlock
    tile={tile}
    onPressProduct={jest.fn()}
    onOpenCategory={jest.fn()}
    cardProps={() => ({})}
    isWishlisted={() => false}
    onToggleWishlist={jest.fn()}
  />
);
const cards = () => screen.queryAllByTestId('dense-product-card').length;

describe('flattenUnique', () => {
  it('joins the pages and keeps each product once', () => {
    const a = product(1) as never;
    const b = product(2) as never;
    expect(flattenUnique([{ items: [a, b] }, { items: [b, product(3) as never] }]).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('CategoryProductBlock', () => {
  it('shows the first six of a bigger category, with See more', async () => {
    total = 14;
    await renderWithProviders(block(), { navigation: false });
    expect(await screen.findByText('Product 1', {}, { timeout: 2000 })).toBeTruthy();
    expect(cards()).toBe(6);
    expect(screen.getByText('Stationery')).toBeTruthy();
    expect(screen.getByTestId('category-see-more-c1')).toBeTruthy();
    expect(screen.queryByText('Product 7')).toBeNull();
  });
});
