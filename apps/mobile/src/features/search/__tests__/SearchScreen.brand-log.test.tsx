import { waitFor } from '@testing-library/react-native';
import type { RootScreenProps } from '@/navigation/types';
import { renderWithProviders } from '@/test-utils';
import { SearchScreen } from '../screens/SearchScreen';

/** Opening Search with a keyword already chosen (the brand link on a product page) is a search too. */
const mockResponse = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

it('saves the keyword the screen is opened with', async () => {
  globalThis.fetch = jest.fn(() => mockResponse({ items: [], total: 0, page: 1, pageSize: 20 })) as unknown as typeof fetch;
  const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn(), push: jest.fn() };
  const props = { navigation: navigation as never, route: { key: 'Search-1', name: 'Search', params: { q: 'Bikano' } } as never } as RootScreenProps<'Search'>;
  const screen = await renderWithProviders(<SearchScreen {...props} />, { navigation: false });
  const calls = () => (globalThis.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('/search/log')) as [string, { method?: string; body?: string }][];
  await waitFor(() => expect(calls()).toHaveLength(1), { timeout: 2000 });
  expect(calls()[0]![1].method).toBe('POST');
  expect(JSON.parse(calls()[0]![1].body!)).toEqual({ q: 'Bikano', source: 'app' });
  expect(await screen.findByText('No results found', {}, { timeout: 2000 })).toBeTruthy();
  // only once, even though the screen re-draws as the results load
  expect(calls()).toHaveLength(1);
});
