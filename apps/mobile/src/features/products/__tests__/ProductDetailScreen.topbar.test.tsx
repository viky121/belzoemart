import { paise, type ProductDetailDto } from '@belzo/shared';
import { fireEvent } from '@testing-library/react-native';
import { useSessionStore } from '@/store/session';
import { renderWithProviders } from '@/test-utils';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';

const PRODUCT: ProductDetailDto = {
  id: 'p1', title: 'Basmati Rice 5kg', slug: 'basmati-rice-5kg', imageUrl: null, mrp: paise(1000), sellingPrice: paise(800), discountPct: 20,
  ratingAvg: 4, ratingCount: 3, description: 'Long grain', brand: null, categoryId: 'c1', hsnCode: '1006', taxRatePct: 5,
  images: [], videoUrl: null,
  variants: [{ id: 'v1', sku: 'RICE', mrp: paise(1000), sellingPrice: paise(800), discountPct: 20, attributes: {}, imageUrl: null, inStock: true, priceSlabs: [] }],
};

function mockOk(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });
}

function setup() {
  const goBack = jest.fn();
  const navigation = { canGoBack: () => true, goBack, navigate: jest.fn(), push: jest.fn() };
  globalThis.fetch = jest.fn((url: string) =>
    mockOk(String(url).includes('/offers/active') ? [] : String(url).includes('/reviews') ? [] : String(url).includes('categoryId') ? { items: [] } : PRODUCT),
  ) as unknown as typeof fetch;
  useSessionStore.setState({ status: 'guest', customer: null });
  return { goBack, navigation };
}
afterEach(() => jest.restoreAllMocks());

describe('ProductDetailScreen top bar', () => {
  it('has a solid bar with back, the product name, wishlist and share, so nothing slides under the status bar', async () => {
    const { navigation, goBack } = setup();
    const ui = await renderWithProviders(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ProductDetailScreen navigation={navigation as any} route={{ key: 'k', name: 'ProductDetail', params: { idOrSlug: 'basmati-rice-5kg' } } as any} />,
      { navigation: false },
    );
    const bar = await ui.findByTestId('pdp-topbar', {}, { timeout: 3000 });
    expect(bar).toBeTruthy();
    expect(ui.getByLabelText('Add to wishlist')).toBeTruthy();
    expect(ui.getByLabelText('Share product')).toBeTruthy();
    expect(ui.getAllByText('Basmati Rice 5kg').length).toBeGreaterThan(0);
    fireEvent.press(ui.getByLabelText('Go back'));
    expect(goBack).toHaveBeenCalled();
  });

  it('shows only one back button (none floating over the picture)', async () => {
    const { navigation } = setup();
    const ui = await renderWithProviders(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ProductDetailScreen navigation={navigation as any} route={{ key: 'k', name: 'ProductDetail', params: { idOrSlug: 'basmati-rice-5kg' } } as any} />,
      { navigation: false },
    );
    await ui.findByTestId('pdp-topbar', {}, { timeout: 3000 });
    expect(ui.getAllByLabelText('Go back')).toHaveLength(1);
  });
});
