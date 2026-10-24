import type { CartOffer } from '@belzo/shared';
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
    id: `line-${over.variantId}`, variantId: 'v', productId: 'p', quantity: 1, savedForLater: false, title: 'Item', sku: 'SKU',
    unit: '1 kg', imageUrl: null, unitPrice: 10000, basePrice: 10000, mrp: 12000, discountPct: 16, taxRatePct: 5,
    inStock: true, available: 10, priceSlabs: [], tierQty: 1, ...over,
  };
}
const offer = (over: Partial<CartOffer> = {}): CartOffer => ({
  offerId: 'o1', name: 'Sugar at 29', variantId: 'sugar', minSpend: 200000, specialPrice: 2900, units: 1, spend: 155000, remaining: 45000,
  unlocked: false, inCart: false, applied: false, productId: 'ps', title: 'Sugar', unit: '1 kg', imageUrl: null, regularPrice: 4500, mrp: 5000, ...over,
});

function mockOk(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });
}
let fetchMock: jest.Mock;
function serve(cart: CartView) {
  fetchMock = jest.fn(() => mockOk(cart));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}
beforeEach(() => useSessionStore.setState({ status: 'guest', customer: null }));
afterEach(() => jest.restoreAllMocks());
const render = () => renderWithProviders(<CartScreen />, { navigation: false, queryClient: createTestQueryClient() });

describe('CartScreen special-price offers', () => {
  it('shows a progress card with how much more to spend', async () => {
    serve({ cartId: 'c', items: [line({ variantId: 'rice', title: 'Rice', quantity: 3 })], offers: [offer()] });
    const screen = await render();
    expect(await screen.findByText('Rice', {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByText('🎁 Sugar 1 kg at ₹29')).toBeTruthy();
    expect(screen.getByText('Add ₹450 more to unlock')).toBeTruthy();
    expect(screen.queryByTestId('cart-offer-add-o1')).toBeNull();
  });

  it('adds the pack from an unlocked card with a POST', async () => {
    serve({ cartId: 'c', items: [line({ variantId: 'rice', title: 'Rice', quantity: 3 })], offers: [offer({ unlocked: true, remaining: 0, spend: 210000 })] });
    const screen = await render();
    fireEvent.press(await screen.findByTestId('cart-offer-add-o1', {}, { timeout: 2000 }));
    await waitFor(
      () => {
        const post = fetchMock.mock.calls.find(([, init]) => (init as { method?: string })?.method === 'POST');
        expect(String(post?.[0])).toContain('/cart/items');
        expect(JSON.parse((post?.[1] as { body: string }).body)).toEqual({ variantId: 'sugar', quantity: 1 });
      },
      { timeout: 2000 },
    );
  });

  it('marks the offer line with its price and caps the stepper at the offer limit', async () => {
    serve({
      cartId: 'c',
      items: [
        line({ variantId: 'rice', title: 'Rice', quantity: 4, unitPrice: 50000 }),
        line({ variantId: 'sugar', title: 'Sugar', unitPrice: 2900, regularUnitPrice: 4500, offerId: 'o1', offerName: 'Sugar at 29', minQty: 1, maxQty: 1 }),
      ],
      offers: [offer({ unlocked: true, inCart: true, applied: true, remaining: 0, spend: 200000 })],
    });
    const screen = await render();
    expect(await screen.findByTestId('cart-offer-tag-sugar', {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByText('🎁 Offer price (was ₹45)')).toBeTruthy();
    expect(screen.getByText('Offer price applied')).toBeTruthy();
    // The sugar stepper cannot go above 1, so its "+" is disabled; the rice stepper still can.
    const plus = screen.getAllByTestId('qty-increment');
    expect(plus).toHaveLength(2);
    expect(plus[1]!.props.accessibilityState?.disabled).toBe(true);
    expect(plus[0]!.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('shows no offer card when the server sends none', async () => {
    serve({ cartId: 'c', items: [line({ variantId: 'rice', title: 'Rice' })] });
    const screen = await render();
    await screen.findByText('Rice', {}, { timeout: 2000 });
    expect(screen.queryByTestId('cart-offers')).toBeNull();
  });
});
