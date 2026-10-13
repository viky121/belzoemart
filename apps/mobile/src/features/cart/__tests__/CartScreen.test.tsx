import { fireEvent, waitFor } from '@testing-library/react-native';

import type { CartLine, CartView } from '@/api/types';
import { useSessionStore } from '@/store/session';
import { createTestQueryClient, renderWithProviders } from '@/test-utils';

import { CartScreen } from '../screens/CartScreen';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }) };
});

function line(over: Partial<CartLine>): CartLine {
  return {
    id: `line-${over.variantId}`,
    variantId: 'v',
    productId: 'p',
    quantity: 1,
    savedForLater: false,
    title: 'Item',
    sku: 'SKU',
    unit: '1 kg',
    imageUrl: null,
    unitPrice: 10000,
    basePrice: 10000,
    mrp: 12000,
    discountPct: 16,
    taxRatePct: 5,
    inStock: true,
    available: 10,
    priceSlabs: [],
    tierQty: 1,
    ...over,
  };
}

const CART: CartView = {
  cartId: 'cart-1',
  items: [
    line({ variantId: 'v-normal', productId: 'p1', title: 'Fresh Apples', quantity: 1 }),
    line({ variantId: 'v-gone', productId: 'p2', title: 'Old Juice', unavailable: true, inStock: false, available: 0 }),
  ],
};

function mockOk(body: unknown) {
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
  fetchMock = jest.fn(() => mockOk(CART));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

const render = () =>
  renderWithProviders(<CartScreen />, { navigation: false, queryClient: createTestQueryClient() });

describe('CartScreen', () => {
  it('renders cart lines and sends the guest token on the cart request', async () => {
    const screen = await render();
    expect(await screen.findByText('Fresh Apples', {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByText('Old Juice')).toBeTruthy();

    const getCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/cart'));
    expect(getCall).toBeTruthy();
    const headers = (getCall?.[1] as { headers: Record<string, string> }).headers;
    expect(headers['x-guest-token']).toBeTruthy();
  });

  it('shows only Remove for an unavailable line (no quantity control)', async () => {
    const screen = await render();
    await screen.findByText('Fresh Apples', {}, { timeout: 2000 });
    expect(screen.getAllByTestId('qty-increment')).toHaveLength(1);
    expect(screen.getByTestId('cart-remove-v-gone')).toBeTruthy();
  });

  it('increments quantity with a PUT carrying {variantId, quantity}', async () => {
    const screen = await render();
    await screen.findByText('Fresh Apples', {}, { timeout: 2000 });

    fireEvent.press(screen.getByTestId('qty-increment'));

    await waitFor(
      () => {
        const put = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'PUT');
        expect(put).toBeTruthy();
        expect(String(put?.[0])).toContain('/cart/items/v-normal');
        expect(JSON.parse((put?.[1] as { body: string }).body)).toEqual({ variantId: 'v-normal', quantity: 2 });
      },
      { timeout: 2000 },
    );
  });
});
