import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { CategoryProductBlock } from '../components/CategoryProductBlocks';

const node = { id: 'c4', name: 'Broken', slug: 'broken', parentId: null, imageUrl: null, children: [] } as unknown as CategoryNodeDto;
const tile: MobileCategoryTile = { id: 'c4', name: 'Broken', iconUrl: null, node };

it('shows nothing when the products cannot be loaded', async () => {
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify({ error: 'ServerError', message: 'boom' })) }),
  ) as unknown as typeof fetch;
  await renderWithProviders(
    <CategoryProductBlock tile={tile} onPressProduct={jest.fn()} onOpenCategory={jest.fn()} cardProps={() => ({})} isWishlisted={() => false} onToggleWishlist={jest.fn()} />,
    { navigation: false },
  );
  await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 150));
  expect(screen.queryByTestId('category-block-c4')).toBeNull();
});
