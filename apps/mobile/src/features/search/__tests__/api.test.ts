import { logSearch } from '../api';

/** logSearch: the small message sent after a real search. */
const okResponse = () => Promise.resolve({ ok: true, status: 204, headers: { get: () => null }, text: () => Promise.resolve('') });
const sent = () => (globalThis.fetch as jest.Mock).mock.calls as [string, { method?: string; body?: string }][];

beforeEach(() => {
  globalThis.fetch = jest.fn(() => okResponse()) as unknown as typeof fetch;
});

describe('logSearch', () => {
  it('sends the tidied keyword as an app search with POST', async () => {
    logSearch('  sugar 1kg ');
    await new Promise((r) => setTimeout(r, 20));
    expect(sent()).toHaveLength(1);
    const [url, init] = sent()[0]!;
    expect(url).toContain('/api/v1/search/log');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body!)).toEqual({ q: 'sugar 1kg', source: 'app' });
  });

  it('sends nothing for an empty or one letter search', async () => {
    logSearch('');
    logSearch('   ');
    logSearch('a');
    await new Promise((r) => setTimeout(r, 20));
    expect(sent()).toHaveLength(0);
  });

  it('never throws or rejects when the request fails', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(() => logSearch('sugar')).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
  });
});
