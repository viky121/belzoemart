import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { CategoryProductBlock } from '../components/CategoryProductBlocks';

/** An empty category, or one that fails to load, draws nothing: the home page must never break. */
const node = { id: 'c3', name: 'Empty', slug: 'empty', parentId: null, imageUrl: null, children: [] } as unknown as CategoryNodeDto;
const tile: MobileCategoryTile = { id: 'c3', name: 'Empty', iconUrl: null, node };
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

it('shows nothing for a category with no products', async () => {
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 6 })) }),
  ) as unknown as typeof fetch;
  await renderWithProviders(block(), { navigation: false });
  await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 100));
  expect(screen.queryByTestId('category-block-c3')).toBeNull();
  expect(screen.queryByText('Empty')).toBeNull();
});
