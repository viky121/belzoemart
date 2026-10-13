import * as SecureStore from 'expo-secure-store';

import { useSessionStore } from '@/store/session';

import { apiRequest } from '../client';
import { ApiError } from '../errors';
import { __resetGuestTokenForTests } from '../guest-token';
import { __testing, sessionEvents, tokenManager } from '../token-manager';

type Init = {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};
type Handler = (url: string, init: Init) => Promise<FakeResponse> | FakeResponse;

interface FakeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

function res(status: number, body?: unknown, headers: Record<string, string> = {}): FakeResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => lower[n.toLowerCase()] ?? null },
    text: async () => text,
  };
}

const envelope = (statusCode: number, error: string, message: string) => ({
  statusCode,
  error,
  message,
  correlationId: 'corr-1234567890',
});

let fetchMock: jest.Mock;
function useFetch(handler: Handler) {
  fetchMock = jest.fn((url: string, init: Init) => Promise.resolve(handler(url, init)));
  (globalThis as { fetch: unknown }).fetch = fetchMock;
}
const calls = () => fetchMock.mock.calls as [string, Init][];
const callsTo = (suffix: string) => calls().filter(([u]) => u.endsWith(suffix));
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Never resolves on its own; rejects like RN fetch when the signal aborts. */
function hangingFetch(_url: string, init: Init): Promise<FakeResponse> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      const e = new Error('Aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });
}

const secureStore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

function authenticate(accessToken: string | null, expiresInMs = 15 * 60_000) {
  useSessionStore.getState().setAuthenticated(null);
  __testing.setAccess(accessToken, accessToken ? Date.now() + expiresInMs : 0);
  secureStore.set('belzo.refreshToken', 'R1');
}

const refreshOk = (n = 2) => res(200, { accessToken: `B`, expiresIn: 900, refreshToken: `R${n}` });

beforeEach(() => {
  jest.useRealTimers();
  __testing.reset();
  __resetGuestTokenForTests();
  secureStore.clear();
  useSessionStore.getState().setGuest();
});

describe('apiRequest headers', () => {
  it('sends X-Client-Platform: mobile on every call and builds the URL', async () => {
    useFetch(() => res(200, { ok: true }));
    await apiRequest('/products', { query: { page: 1, sort: 'newest', brandId: undefined } });
    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' } });
    expect(calls()).toHaveLength(2);
    for (const [, init] of calls()) {
      expect(init.headers['x-client-platform']).toBe('mobile');
      expect(init.headers.Accept).toBe('application/json');
    }
    expect(calls()[0]![0]).toBe('http://api.test/api/v1/products?page=1&sort=newest');
    expect(calls()[1]![1].headers['Content-Type']).toBe('application/json');
    expect(calls()[1]![1].body).toBe(JSON.stringify({ email: 'a@b.c', password: 'x' }));
  });

  it('attaches the Bearer when authenticated', async () => {
    authenticate('A');
    useFetch(() => res(200, { id: 'c1' }));
    await expect(apiRequest('/me', { auth: 'required' })).resolves.toEqual({ id: 'c1' });
    expect(calls()[0]![1].headers.Authorization).toBe('Bearer A');
  });

  it('sends x-guest-token only for guest cart calls', async () => {
    useFetch(() => res(200, { cartId: 'g', items: [] }));
    await apiRequest('/cart', { auth: 'optional', cart: true });
    await apiRequest('/products');
    const guestHeader = calls()[0]![1].headers['x-guest-token'];
    expect(typeof guestHeader).toBe('string');
    expect(guestHeader!.length).toBeGreaterThanOrEqual(8);
    expect(calls()[0]![1].headers.Authorization).toBeUndefined();
    expect(calls()[1]![1].headers['x-guest-token']).toBeUndefined();

    authenticate('A');
    await apiRequest('/cart', { auth: 'optional', cart: true });
    expect(calls()[2]![1].headers.Authorization).toBe('Bearer A');
    expect(calls()[2]![1].headers['x-guest-token']).toBeUndefined();
  });

  it("auth:'required' as a guest fails without a network call", async () => {
    useFetch(() => res(200, {}));
    await expect(apiRequest('/me', { auth: 'required' })).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
      code: 'NotAuthenticated',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('token refresh', () => {
  it('single-flight: 3 concurrent 401s trigger exactly one refresh and all retry with the new token', async () => {
    authenticate('A');
    useFetch(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 20));
        return refreshOk();
      }
      return init.headers.Authorization === 'Bearer B'
        ? res(200, { url })
        : res(401, envelope(401, 'UnauthorizedException', 'Unauthorized'));
    });
    const results = await Promise.all([
      apiRequest('/me', { auth: 'required' }),
      apiRequest('/orders', { auth: 'required' }),
      apiRequest('/wishlist', { auth: 'required' }),
    ]);
    expect(results).toHaveLength(3);
    expect(callsTo('/auth/refresh')).toHaveLength(1);
    const retried = calls().filter(([, i]) => i.headers.Authorization === 'Bearer B');
    expect(retried).toHaveLength(3);
    expect(JSON.parse(callsTo('/auth/refresh')[0]![1].body!)).toEqual({ refreshToken: 'R1' });
    expect(secureStore.get('belzo.refreshToken')).toBe('R2');
  });

  it('refreshes proactively when the access token expires within 60 s', async () => {
    authenticate('A', 30_000);
    useFetch((url) => (url.endsWith('/auth/refresh') ? refreshOk() : res(200, { ok: true })));
    await apiRequest('/me', { auth: 'required' });
    expect(calls().map(([u]) => u.replace('http://api.test/api/v1', ''))).toEqual([
      '/auth/refresh',
      '/me',
    ]);
    expect(calls()[1]![1].headers.Authorization).toBe('Bearer B');
    // The refresh call itself is unauthenticated and carries the platform header.
    expect(calls()[0]![1].headers.Authorization).toBeUndefined();
    expect(calls()[0]![1].headers['x-client-platform']).toBe('mobile');
  });

  it('refresh 401 expires the session, clears SecureStore and throws auth', async () => {
    authenticate(null);
    const expired = jest.fn();
    sessionEvents.on('expired', expired);
    useFetch(() => res(401, envelope(401, 'UnauthorizedException', 'Invalid refresh token')));
    await expect(apiRequest('/me', { auth: 'required' })).rejects.toMatchObject({ kind: 'auth' });
    expect(secureStore.has('belzo.refreshToken')).toBe(false);
    expect(useSessionStore.getState().status).toBe('guest');
    expect(expired).toHaveBeenCalledWith('rejected');
  });

  it('refresh network error keeps the refresh token and the session', async () => {
    authenticate(null);
    useFetch((url) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('Network request failed');
      return res(200, {});
    });
    await expect(apiRequest('/me', { auth: 'required' })).rejects.toMatchObject({
      kind: 'network',
    });
    expect(secureStore.get('belzo.refreshToken')).toBe('R1');
    expect(useSessionStore.getState().status).toBe('authenticated');
  });

  it('a 401 after a successful refresh logs the user out', async () => {
    authenticate('A');
    const expired = jest.fn();
    sessionEvents.on('expired', expired);
    useFetch((url) =>
      url.endsWith('/auth/refresh')
        ? refreshOk()
        : res(401, envelope(401, 'UnauthorizedException', 'Unauthorized')),
    );
    await expect(apiRequest('/me', { auth: 'required' })).rejects.toMatchObject({ kind: 'auth' });
    expect(callsTo('/me')).toHaveLength(2);
    expect(callsTo('/auth/refresh')).toHaveLength(1);
    expect(expired).toHaveBeenCalledWith('unauthorized');
    expect(secureStore.has('belzo.refreshToken')).toBe(false);
    expect(useSessionStore.getState().status).toBe('guest');
  });

  it('a 401 on an auth:none call is surfaced as-is (no refresh)', async () => {
    useFetch(() => res(401, envelope(401, 'UnauthorizedException', 'Invalid email or password')));
    await expect(
      apiRequest('/auth/login', { method: 'POST', body: {}, auth: 'none' }),
    ).rejects.toMatchObject({ kind: 'http', status: 401, message: 'Invalid email or password' });
    expect(callsTo('/auth/refresh')).toHaveLength(0);
  });

  it('a 2xx refresh without refreshToken is ServerTooOld and keeps the stored token', async () => {
    authenticate(null);
    useFetch(() => res(200, { accessToken: 'B', expiresIn: 900 }));
    await expect(apiRequest('/me', { auth: 'required' })).rejects.toMatchObject({
      kind: 'config',
      code: 'ServerTooOld',
    });
    expect(secureStore.get('belzo.refreshToken')).toBe('R1');
  });

  it('logout during an in-flight refresh discards the new token (generation)', async () => {
    authenticate(null);
    let releaseRefresh: () => void = () => undefined;
    useFetch((url) => {
      if (url.endsWith('/auth/refresh')) {
        return new Promise<FakeResponse>((resolve) => {
          releaseRefresh = () => resolve(refreshOk());
        });
      }
      if (url.endsWith('/auth/logout')) return res(200, { success: true });
      return res(200, { ok: true });
    });
    const pending = apiRequest('/me', { auth: 'required' });
    await flush();
    expect(tokenManager.isRefreshing()).toBe(true);
    await tokenManager.logout();
    releaseRefresh();
    await expect(pending).rejects.toMatchObject({ kind: 'auth' });
    await flush();
    expect(secureStore.has('belzo.refreshToken')).toBe(false);
    expect(__testing.getAccess().token).toBeNull();
    expect(useSessionStore.getState().status).toBe('guest');
    const logoutBodies = callsTo('/auth/logout').map(([, i]) => JSON.parse(i.body!));
    expect(logoutBodies).toEqual([{ refreshToken: 'R1' }, { refreshToken: 'R2' }]);
    expect(callsTo('/me')).toHaveLength(0);
  });
});

describe('429, timeout, abort and error bodies', () => {
  afterEach(() => jest.useRealTimers());

  it('retries a 429 with Retry-After: 1 and succeeds', async () => {
    jest.useFakeTimers();
    let n = 0;
    useFetch(() =>
      ++n === 1
        ? res(429, envelope(429, 'ThrottlerException', 'Too Many Requests'), { 'Retry-After': '1' })
        : res(200, { ok: true }),
    );
    const p = apiRequest('/products');
    await jest.advanceTimersByTimeAsync(1_300);
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 429 without Retry-After', async () => {
    useFetch(() =>
      res(429, envelope(429, 'TooManyRequests', 'Too many attempts. Try again later.')),
    );
    await expect(
      apiRequest('/auth/otp/request', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      message: 'Too many attempts. Try again later.',
      retryAfterSec: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 429 whose Retry-After exceeds 10 s and exposes retryAfterSec', async () => {
    useFetch(() =>
      res(429, envelope(429, 'ThrottlerException', 'Too Many Requests'), { 'Retry-After': '42' }),
    );
    await expect(apiRequest('/auth/otp/request', { method: 'POST' })).rejects.toMatchObject({
      status: 429,
      retryAfterSec: 42,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a timeout to kind timeout', async () => {
    jest.useFakeTimers();
    useFetch(hangingFetch);
    const p = apiRequest('/products', { timeoutMs: 1_000 });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it('maps a caller abort to kind aborted', async () => {
    useFetch(hangingFetch);
    const controller = new AbortController();
    const p = apiRequest('/search', { signal: controller.signal });
    await flush();
    controller.abort();
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('turns a non-JSON error body into a generic ApiError', async () => {
    useFetch(() => res(502, '<html>Bad gateway</html>'));
    const err = await apiRequest('/products').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      kind: 'http',
      status: 502,
      code: 'RequestFailed',
      message: 'Request failed (502)',
    });
  });

  it('uses the error envelope when present', async () => {
    useFetch(() =>
      res(400, envelope(400, 'BadRequestException', "Sorry, we don't deliver to PIN 560001 yet")),
    );
    await expect(apiRequest('/checkout/preview', { method: 'POST' })).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      code: 'BadRequestException',
      correlationId: 'corr-1234567890',
    });
  });

  it('maps a fetch TypeError to kind network and a bad 2xx body to kind parse', async () => {
    useFetch(() => {
      throw new TypeError('Network request failed');
    });
    await expect(apiRequest('/products')).rejects.toMatchObject({ kind: 'network' });
    useFetch(() => res(200, 'not json'));
    await expect(apiRequest('/products')).rejects.toMatchObject({ kind: 'parse' });
    useFetch(() => res(204));
    await expect(apiRequest('/notifications/read', { method: 'POST' })).resolves.toBeNull();
  });
});
