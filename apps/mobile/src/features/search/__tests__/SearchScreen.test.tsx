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
  title: 'Lemon Soap 100g | Bathing Soap Bar',
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
  globalThis.fetch = jest.fn(() => mockResponse(searchResult)) as unknown as typeof fetch;
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
  it('shows product suggestions with the short name, then runs the results query on "See all"', async () => {
    const screen = await renderWithProviders(<SearchScreen {...props()} />, { navigation: false });

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'soap');
    // The name after the pipe is left out of the suggestion.
    expect(await screen.findByText('Lemon Soap 100g', {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.queryByText(/Bathing Soap Bar/)).toBeNull();

    fireEvent.press(screen.getByTestId('suggest-see-all'));
    await waitFor(
      () => {
        const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
        expect(calls.some((u) => u.includes('/search?') && u.includes('q=soap') && u.includes('pageSize=20'))).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it('opens the product when a suggestion is tapped', async () => {
    const p = props();
    const screen = await renderWithProviders(<SearchScreen {...p} />, { navigation: false });

    fireEvent.changeText(screen.getByPlaceholderText('Search products'), 'soap');
    fireEvent.press(await screen.findByTestId('suggest-lemon-soap', {}, { timeout: 2000 }));
    expect(p.navigation.navigate).toHaveBeenCalledWith('ProductDetail', { idOrSlug: 'lemon-soap' });
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

describe('SearchScreen: saving real searches for the admin report', () => {
  const logCalls = () =>
    (globalThis.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('/search/log')) as [string, { method?: string; body?: string }][];

  it('does not save while typing; saves the typed keyword when a suggestion is tapped', async () => {
    const screen = await renderWithProviders(<SearchScreen {...props()} />, { navigation: false });
    const input = screen.getByPlaceholderText('Search products');
    fireEvent.changeText(input, 'so');
    fireEvent.changeText(input, 'soap');
    const suggestion = await screen.findByTestId('suggest-lemon-soap', {}, { timeout: 2000 });
    expect(logCalls()).toHaveLength(0);
    fireEvent.press(suggestion);
    await waitFor(() => expect(logCalls()).toHaveLength(1), { timeout: 2000 });
    const [url, init] = logCalls()[0]!;
    expect(url).toContain('/api/v1/search/log');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body!)).toEqual({ q: 'soap', source: 'app' });
  });
});
