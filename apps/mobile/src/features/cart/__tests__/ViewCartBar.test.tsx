import { StyleSheet } from 'react-native';
import { useSessionStore } from '@/store/session';
import { createTestQueryClient, renderWithProviders } from '@/test-utils';
import { ViewCartBar } from '../components/ViewCartBar';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: jest.fn() }) };
});

const line = (variantId: string, quantity: number) => ({
  id: `l-${variantId}`, variantId, productId: 'p', quantity, savedForLater: false, title: 'Item', sku: variantId, unit: '1 kg',
  imageUrl: null, unitPrice: 10000, basePrice: 10000, mrp: 12000, discountPct: 16, taxRatePct: 5, inStock: true, available: 10, priceSlabs: [], tierQty: 1,
});
const serve = (items: unknown[]) => {
  globalThis.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify({ cartId: 'c', items })) }),
  ) as unknown as typeof fetch;
};

describe('ViewCartBar', () => {
  beforeEach(() => useSessionStore.setState({ status: 'guest', customer: null }));
  afterEach(() => jest.restoreAllMocks());

  it('is a compact pill, not a full-width bar', async () => {
    serve([line('a', 1)]);
    const ui = await renderWithProviders(<ViewCartBar bottom={80} />, { navigation: false, queryClient: createTestQueryClient() });
    const bar = await ui.findByTestId('view-cart-bar', {}, { timeout: 3000 });
    const style = StyleSheet.flatten(bar.props.style);
    expect(style.width).toBe('68%');
    expect(style.maxWidth).toBeLessThanOrEqual(300);
    expect(ui.getByText('1 item')).toBeTruthy();
  });

  it('keeps clear of what is under it (room below the pill)', async () => {
    serve([line('a', 2)]);
    const ui = await renderWithProviders(<ViewCartBar bottom={80} />, { navigation: false, queryClient: createTestQueryClient() });
    const bar = await ui.findByTestId('view-cart-bar', {}, { timeout: 3000 });
    const wrap = StyleSheet.flatten(bar.parent?.props.style);
    expect(wrap.bottom).toBe(80);
    expect(wrap.paddingBottom).toBeGreaterThanOrEqual(16);
  });

  it('shows nothing for an empty cart', async () => {
    serve([]);
    const ui = await renderWithProviders(<ViewCartBar bottom={80} />, { navigation: false, queryClient: createTestQueryClient() });
    await new Promise((r) => setTimeout(r, 200));
    expect(ui.queryByTestId('view-cart-bar')).toBeNull();
  });
});
