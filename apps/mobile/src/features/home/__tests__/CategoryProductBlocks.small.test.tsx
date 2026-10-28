import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { CategoryProductBlock } from '../components/CategoryProductBlocks';

// The test phone reports a font scale of 2, which would give two columns: pin three here.
jest.mock('@/ui/use-grid-columns', () => ({ ...jest.requireActual('@/ui/use-grid-columns'), useGridColumns: () => 3 }));

/** A small category (six or fewer products) has no See more button; an empty or broken one shows nothing. */
const node = { id: 'c2', name: 'Grocery', slug: 'grocery', parentId: null, imageUrl: null, children: [] } as unknown as CategoryNodeDto;
const tile: MobileCategoryTile = { id: 'c2', name: 'Grocery', iconUrl: null, node };

function product(n: number) {
  return {
    id: `p${n}`, title: `Item ${n}`, slug: `p${n}`, imageUrl: null, mrp: 10000, sellingPrice: 8000, discountPct: 20,
    ratingAvg: 4, ratingCount: 1, defaultVariantId: `v${n}`, unit: '1 pc',
  };
}
function serve(total: number, ok = true) {
  globalThis.fetch = jest.fn((url: string) => {
    const q = new URL(url).searchParams;
    const page = Number(q.get('page') ?? 1);
    const size = Number(q.get('pageSize') ?? 20);
    const items = Array.from({ length: total }, (_, i) => product(i + 1)).slice((page - 1) * size, page * size);
    return Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(ok ? { items, total, page, pageSize: size } : { error: 'ServerError', message: 'boom' })),
    });
  }) as unknown as typeof fetch;
}
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

it('has no See more button when the category has exactly six products', async () => {
  serve(6);
  await renderWithProviders(block(), { navigation: false });
  expect(await screen.findByText('Item 6', {}, { timeout: 2000 })).toBeTruthy();
  expect(screen.queryAllByTestId('dense-product-card')).toHaveLength(6);
  expect(screen.queryByTestId('category-see-more-c2')).toBeNull();
});
