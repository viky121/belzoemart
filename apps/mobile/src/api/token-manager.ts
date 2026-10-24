import { mobileRefreshResponseSchema } from '@belzo/shared';

import { secure } from '@/lib/secure';
import { sessionStore } from '@/store/session';

import { apiRequest } from './client';
import { ApiError, toApiError } from './errors';

/**
 * Token manager (design §5.3). The access token lives only in module memory; the refresh token
 * only in SecureStore. `refresh()` is single-flight; `generation` discards refreshes that
 * complete after a logout/expiry/new login.
 */
export type ExpireReason = 'missing' | 'rejected' | 'unauthorized' | 'logout';

type Listener = (reason: ExpireReason) => void;
const listeners = new Set<Listener>();

export const sessionEvents = {
  on(event: 'expired', fn: Listener): () => void {
    void event;
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  emit(event: 'expired', reason: ExpireReason): void {
    void event;
    for (const fn of Array.from(listeners)) fn(reason);
  },
};

const PROACTIVE_WINDOW_MS = 60_000;

let accessToken: string | null = null;
let accessExpiresAt = 0;
let inflight: Promise<string> | null = null;
let generation = 0;

const authError = (code = 'SessionExpired', status = 401) =>
  new ApiError({ kind: 'auth', status, code });

function revokeQuietly(refreshToken: string): void {
  void apiRequest('/auth/logout', {
    method: 'POST',
    auth: 'none',
    body: { refreshToken },
    timeoutMs: 5_000,
    retry429: false,
  }).catch(() => undefined);
}

async function expireSession(reason: ExpireReason): Promise<void> {
  generation++;
  accessToken = null;
  accessExpiresAt = 0;
  await secure.deleteRefreshToken();
  sessionStore.setGuest();
  sessionEvents.emit('expired', reason);
}

async function doRefresh({ retry429 }: { retry429: boolean }): Promise<string> {
  const gen = generation;
  const rt = await secure.getRefreshToken();
  if (!rt) {
    await expireSession('missing');
    throw authError('NoRefreshToken');
  }

  let json: unknown;
  try {
    json = await apiRequest<unknown>('/auth/refresh', {
      method: 'POST',
      auth: 'none',
      body: { refreshToken: rt },
      timeoutMs: 10_000,
      retry429,
    });
  } catch (e) {
    const err = toApiError(e);
    if (err.kind === 'http' && (err.status === 400 || err.status === 401 || err.status === 403)) {
      // Invalid, expired, reuse-detected or blocked: the session is over.
      if (gen === generation) await expireSession('rejected');
      throw authError('SessionExpired', err.status);
    }
    // network, timeout, 5xx, 429-exhausted: keep the refresh token for a later retry.
    throw err;
  }

  const parsed = mobileRefreshResponseSchema.safeParse(json);
  if (!parsed.success) {
    const missingRefresh =
      typeof json === 'object' &&
      json !== null &&
      'accessToken' in json &&
      !('refreshToken' in json);
    if (missingRefresh) {
      // A server without A1 rotated the cookie instead; keep our stored token untouched.
      throw new ApiError({ kind: 'config', code: 'ServerTooOld' });
    }
    throw new ApiError({ kind: 'parse', message: 'Invalid refresh response' });
  }
  const res = parsed.data;

  if (gen !== generation) {
    // A logout happened meanwhile: revoke the new family member and drop it.
    revokeQuietly(res.refreshToken);
    throw authError();
  }

  // Persist first, then memory.
  await secure.setRefreshToken(res.refreshToken);
  if (gen !== generation) {
    // Logout raced with the SecureStore write: undo it.
    await secure.deleteRefreshToken();
    revokeQuietly(res.refreshToken);
    throw authError();
  }
  accessToken = res.accessToken;
  accessExpiresAt = Date.now() + res.expiresIn * 1000;
  return res.accessToken;
}

export interface RefreshOptions {
  force?: boolean;
  failedToken?: string;
  retry429?: boolean;
}

function refresh({ force, failedToken, retry429 = true }: RefreshOptions = {}): Promise<string> {
  if (inflight) return inflight;
  if (force && accessToken && failedToken !== accessToken) {
    // Another caller already rotated after this request was sent.
    return Promise.resolve(accessToken);
  }
  inflight = doRefresh({ retry429 }).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function getValidAccessToken(): Promise<string> {
  if (accessToken && accessExpiresAt - PROACTIVE_WINDOW_MS > Date.now()) return accessToken;
  return refresh();
}

async function setSession(tokens: {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}): Promise<void> {
  await secure.setRefreshToken(tokens.refreshToken);
  accessToken = tokens.accessToken;
  accessExpiresAt = Date.now() + tokens.expiresIn * 1000;
  generation++;
}

async function logout(): Promise<void> {
  const rt = await secure.getRefreshToken();
  if (rt) {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        auth: 'none',
        body: { refreshToken: rt },
        timeoutMs: 5_000,
        retry429: false,
      });
    } catch {
      // Best effort: the local session ends regardless.
    }
  }
  await expireSession('logout');
}

export const tokenManager = {
  getValidAccessToken,
  refresh,
  setSession,
  expireSession,
  logout,
  /** True when a refresh request is currently in flight. */
  isRefreshing: () => inflight !== null,
};

/** Test-only helpers. */
export const __testing = {
  reset(): void {
    accessToken = null;
    accessExpiresAt = 0;
    inflight = null;
    generation = 0;
    listeners.clear();
  },
  setAccess(token: string | null, expiresAt: number): void {
    accessToken = token;
    accessExpiresAt = expiresAt;
  },
  getAccess(): { token: string | null; expiresAt: number; generation: number } {
    return { token: accessToken, expiresAt: accessExpiresAt, generation };
  },
};
