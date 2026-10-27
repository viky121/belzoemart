import { paise, type ProductDetailDto } from '@belzo/shared';
import { fireEvent } from '@testing-library/react-native';
import { useSessionStore } from '@/store/session';
import { renderWithProviders } from '@/test-utils';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';

const product = (over: Partial<ProductDetailDto> = {}): ProductDetailDto => ({
  id: 'p1', title: 'Bikano Utsav Gift Box', slug: 'bikano-utsav', imageUrl: null, mrp: paise(32000), sellingPrice: paise(29440), discountPct: 8,
  ratingAvg: 4, ratingCount: 3, description: 'Sweets', brand: 'Bikano', brandId: 'brand-1', categoryId: 'c1', hsnCode: '2106', taxRatePct: 5,
  images: [], videoUrl: null,
  variants: [{ id: 'v1', sku: 'BIK', mrp: paise(32000), sellingPrice: paise(29440), discountPct: 8, attributes: {}, imageUrl: null, inStock: true, priceSlabs: [] }],
  ...over,
});
const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

async function open(p: ProductDetailDto) {
  const navigation = { canGoBack: () => true, goBack: jest.fn(), navigate: jest.fn(), push: jest.fn() };
  globalThis.fetch = jest.fn((url: string) =>
    ok(String(url).includes('/offers/active') ? [] : String(url).includes('/reviews') ? [] : String(url).includes('categoryId') ? { items: [] } : p),
  ) as unknown as typeof fetch;
  useSessionStore.setState({ status: 'guest', customer: null });
  const ui = await renderWithProviders(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ProductDetailScreen navigation={navigation as any} route={{ key: 'k', name: 'ProductDetail', params: { idOrSlug: p.slug } } as any} />,
    { navigation: false },
  );
  return { ui, navigation };
}
afterEach(() => jest.restoreAllMocks());

describe('Product page: the brand name', () => {
  it('opens the list of every product of that brand when tapped', async () => {
    const { ui, navigation } = await open(product());
    const link = await ui.findByTestId('pdp-brand', {}, { timeout: 3000 });
    expect(link.props.accessibilityLabel).toBe('See all Bikano products');
    await fireEvent.press(link);
    expect(navigation.navigate).toHaveBeenCalledWith('ProductList', { brandId: 'brand-1', title: 'Bikano' });
  });

  it('falls back to searching the brand name when the server did not send a brand id', async () => {
    const { ui, navigation } = await open(product({ brandId: null }));
    await fireEvent.press(await ui.findByTestId('pdp-brand', {}, { timeout: 3000 }));
    expect(navigation.navigate).toHaveBeenCalledWith('Search', { q: 'Bikano' });
  });

  it('shows no brand link for a product without a brand', async () => {
    const { ui } = await open(product({ brand: null, brandId: null }));
    await ui.findByTestId('pdp-topbar', {}, { timeout: 3000 });
    expect(ui.queryByTestId('pdp-brand')).toBeNull();
  });
});
