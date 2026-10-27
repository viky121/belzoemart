import { ApiError, MESSAGES, toApiError, userMessage } from '../errors';

describe('toApiError / userMessage', () => {
  it('a failed request is a network problem ("offline")', () => {
    for (const m of ['Network request failed', 'Failed to fetch', 'Load failed', 'The Internet connection appears to be offline']) {
      const err = toApiError(new TypeError(m));
      expect(err.kind).toBe('network');
      expect(userMessage(new TypeError(m))).toBe(MESSAGES.offline);
    }
  });

  it('a TypeError from our own code is NOT shown as "offline"', () => {
    const e = new TypeError("Cannot read properties of undefined (reading 'uri')");
    expect(toApiError(e).kind).toBe('parse');
    expect(userMessage(e)).toBe(MESSAGES.generic);
  });

  it('keeps ApiErrors as they are and wraps other errors and strings', () => {
    const api = new ApiError({ kind: 'timeout' });
    expect(toApiError(api)).toBe(api);
    expect(toApiError(new Error('boom')).kind).toBe('parse');
    expect(toApiError('weird').kind).toBe('parse');
    expect(userMessage(api)).toBe(MESSAGES.timeout);
  });
});
