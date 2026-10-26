import { apiFetch } from './api-client';
import { trackSearch } from './search-track';

jest.mock('./api-client', () => ({ apiFetch: jest.fn() }));
const mockFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('trackSearch', () => {
  beforeEach(() => mockFetch.mockReset().mockResolvedValue(null));

  it('sends the tidied keyword as a website search', () => {
    trackSearch('  sugar 1kg ');
    expect(mockFetch).toHaveBeenCalledWith('/search/log', { method: 'POST', body: { q: 'sugar 1kg', source: 'web' }, accessToken: undefined });
  });

  it('sends the login token when there is one', () => {
    trackSearch('sugar', 'tok');
    expect(mockFetch).toHaveBeenCalledWith('/search/log', expect.objectContaining({ accessToken: 'tok' }));
  });

  it('sends nothing for an empty or one letter search', () => {
    trackSearch('');
    trackSearch('  ');
    trackSearch('a');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never throws or rejects when the request fails', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    expect(() => trackSearch('sugar')).not.toThrow();
    await new Promise((r) => setImmediate(r));
  });
});
