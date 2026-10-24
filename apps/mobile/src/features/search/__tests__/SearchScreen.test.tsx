import { fireEvent, waitFor } from '@testing-library/react-native';
import type { RootScreenProps } from '@/navigation/types';
import { useRecentSearchesStore } from '@/store/recent-searches';
import { renderWithProviders } from '@/test-utils';

import { SearchScreen } from '../screens/SearchScreen';

type FetchResult = { status?: number; body: unknown };
let searchResult: FetchResult;

function mockResponse({ status = 200, body }: FetchResult) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const PRODUCT = {
  id: 'p1',
  title: 'Lemon Soap',
  slug: 'lemon-soap',
  imageUrl: null,
  mrp: 5000,
  sellingPrice: 4000,
  discountPct: 20,
  ratingAvg: 4,
  ratingCount: 10,
  defaultVariantId: 'v1',
  unit: '100 g',
};

beforeEach(() => {
  useRecentSearchesStore.setState({ terms: [] });
  searchResult = { body: { items: [PRODUCT], total: 1, page: 1, pageSize: 20 } };
  globalThis.fetch = jest.fn((url: string) => {
    if (url.includes('/search/autocomplete')) return mockResponse({ body: ['Soap', 'Soap bar'] });
    return mockResponse(searchResult);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

function props(params: Record<string, unknown> = {}): RootScreenProps<'Search'> {
  const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn(), push: jest.fn() };
  return {
    navigation: navigation as never,
    route: { key: 'Search-1', name: 'Search', params } as never,
  };
}

describe('SearchScreen', () => {
  it('debounces autocomplete suggestions, then runs the results query on select', async () => {
    const screen = await renderWithProviders(<SearchScreen {...props()} />, { navigation: false });

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'soap');
    expect(await screen.findByText('Soap', {}, { timeout: 2000 })).toBeTruthy();

    fireEvent.press(screen.getByText('Soap'));
    await waitFor(
      () => {
        const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
        expect(calls.some((u) => u.includes('/search?') && u.includes('q=Soap'))).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it('shows a no-results state when the search returns nothing', async () => {
    searchResult = { body: { items: [], total: 0, page: 1, pageSize: 20 } };
    const screen = await renderWithProviders(<SearchScreen {...props({ q: 'zzz' })} />, { navigation: false });
    expect(await screen.findByText('No results found', {}, { timeout: 2000 })).toBeTruthy();
  });

  it('shows an error with Retry when the search fails', async () => {
    searchResult = { status: 500, body: { error: 'ServerError', message: 'boom' } };
    const screen = await renderWithProviders(<SearchScreen {...props({ q: 'err' })} />, { navigation: false });
    expect(await screen.findByText('Retry', {}, { timeout: 2000 })).toBeTruthy();
  });
});
