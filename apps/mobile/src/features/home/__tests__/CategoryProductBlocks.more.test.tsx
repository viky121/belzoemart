import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { CategoryProductBlock } from '../components/CategoryProductBlocks';

// The test phone reports a font scale of 2, which would give two columns: pin three here.
jest.mock('@/ui/use-grid-columns', () => ({ ...jest.requireActual('@/ui/use-grid-columns'), useGridColumns: () => 3 }));

/** See more adds the next six; the button stays while products are left and goes when the last ones are shown. */
const node = { id: 'c5', name: 'Drinks', slug: 'drinks', parentId: null, imageUrl: null, children: [] } as unknown as CategoryNodeDto;
const tile: MobileCategoryTile = { id: 'c5', name: 'Drinks', iconUrl: null, node };
const TOTAL = 14; // 6 + 6 + 2

function product(n: number) {
  return {
    id: `p${n}`, title: `Drink ${n}`, slug: `p${n}`, imageUrl: null, mrp: 10000, sellingPrice: 8000, discountPct: 20,
    ratingAvg: 4, ratingCount: 1, defaultVariantId: `v${n}`, unit: '1 pc',
  };
}
const cards = () => screen.queryAllByTestId('dense-product-card').length;

it('adds six at a time and removes the button after the last products', async () => {
  globalThis.fetch = jest.fn((url: string) => {
    const q = new URL(url).searchParams;
    const page = Number(q.get('page') ?? 1);
    const size = Number(q.get('pageSize') ?? 20);
    const items = Array.from({ length: TOTAL }, (_, i) => product(i + 1)).slice((page - 1) * size, page * size);
    return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify({ items, total: TOTAL, page, pageSize: size })) });
  }) as unknown as typeof fetch;
  await renderWithProviders(
    <CategoryProductBlock tile={tile} onPressProduct={jest.fn()} onOpenCategory={jest.fn()} cardProps={() => ({})} isWishlisted={() => false} onToggleWishlist={jest.fn()} />,
    { navigation: false },
  );
  expect(await screen.findByText('Drink 6', {}, { timeout: 2000 })).toBeTruthy();
  expect(cards()).toBe(6);

  await fireEvent.press(screen.getByTestId('category-see-more-c5'));
  expect(await screen.findByText('Drink 12', {}, { timeout: 2000 })).toBeTruthy();
  expect(cards()).toBe(12);
  expect(screen.getByTestId('category-see-more-c5')).toBeTruthy(); // 2 products are still left

  await fireEvent.press(screen.getByTestId('category-see-more-c5'));
  expect(await screen.findByText('Drink 14', {}, { timeout: 2000 })).toBeTruthy();
  await waitFor(() => expect(screen.queryByTestId('category-see-more-c5')).toBeNull());
  expect(cards()).toBe(14);
});
