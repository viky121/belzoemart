import { fireEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/store/session';
import { createTestQueryClient, renderWithProviders } from '@/test-utils';

import { ProductListScreen } from '../screens/ProductListScreen';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }) };
});

// FlashList needs native layout; a plain View list is enough to check what each cell renders.
jest.mock('@shopify/flash-list', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    FlashList: ({ data, renderItem }: { data: unknown[]; renderItem: (a: { item: unknown }) => unknown }) => (
      <View>{data.map((item, i) => <View key={i}>{renderItem({ item }) as never}</View>)}</View>
    ),
  };
});

const PRODUCTS = {
  items: [
    {
      id: 'p1',
      title: 'Cotton Twist Mop',
      slug: 'cotton-twist-mop',
      imageUrl: null,
      mrp: 34900,
      sellingPrice: 24430,
      discountPct: 30,
      ratingAvg: 0,
      ratingCount: 0,
      defaultVariantId: 'v1',
      unit: '122 cm',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};
const EMPTY_CART = { cartId: 'c1', items: [] };

function ok(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

let fetchMock: jest.Mock;
beforeEach(() => {
  useSessionStore.setState({ status: 'guest', customer: null });
  fetchMock = jest.fn((url: string, init?: { method?: string }) => {
    const u = String(url);
    if (u.includes('/cart/items') && init?.method === 'POST') {
      return ok({
        cartId: 'c1',
        items: [
          {
            id: 'l1',
            variantId: 'v1',
            productId: 'p1',
            quantity: 1,
            savedForLater: false,
            title: 'Cotton Twist Mop',
            sku: 'S',
            unit: '122 cm',
            imageUrl: null,
            unitPrice: 24430,
            basePrice: 24430,
            mrp: 34900,
            discountPct: 30,
            taxRatePct: 18,
            inStock: true,
            available: 10,
            priceSlabs: [],
            tierQty: 1,
          },
        ],
      });
    }
    if (u.endsWith('/cart')) return ok(EMPTY_CART);
    if (u.includes('/products')) return ok(PRODUCTS);
    return ok([]);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

describe('ProductListScreen add to cart', () => {
  it('shows the cart control on each product and adds the default variant', async () => {
    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
    const screen = await renderWithProviders(
      <ProductListScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'ProductList', params: { categoryId: 'c' } } as never}
      />,
      { queryClient: createTestQueryClient() },
    );
    const add = await screen.findByTestId('product-card-add', {}, { timeout: 3000 });
    fireEvent.press(add);
    await waitFor(
      () => {
        const post = fetchMock.mock.calls.find(
          ([url, init]) => String(url).includes('/cart/items') && (init as { method?: string })?.method === 'POST',
        );
        expect(post).toBeTruthy();
        expect(JSON.parse((post?.[1] as { body: string }).body)).toEqual({ variantId: 'v1', quantity: 1 });
      },
      { timeout: 3000 },
    );
    // The button turns into the stepper once the cart has the item.
    expect(await screen.findByTestId('product-card-stepper', {}, { timeout: 3000 })).toBeTruthy();
  });
});
