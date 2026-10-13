import { apiErrorSchema, CLIENT_PLATFORM_HEADER, MOBILE_CLIENT_PLATFORM } from '@belzo/shared';

import { env } from '@/config/env';
import { sessionStore } from '@/store/session';

import { ApiError, isApiError } from './errors';
import { getGuestToken } from './guest-token';
import { tokenManager } from './token-manager';

/** Typed fetch client (design §5). Screens never call this directly; feature api.ts files do. */
export type AuthMode = 'none' | 'optional' | 'required';

export interface RequestOptions {
  /** Default GET. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Undefined values are dropped; values are encoded with encodeURIComponent. */
  query?: Record<string, string | number | undefined>;
  /** JSON-encoded unless FormData. */
  body?: unknown;
  /** Default 'none'. */
  auth?: AuthMode;
  /** Adds the cart identity rules: x-guest-token only when no Bearer is attached. */
  cart?: boolean;
  /** Default 15 s; uploads 60 s; refresh 10 s. */
  timeoutMs?: number;
  /** TanStack Query's signal, composed with the timeout. */
  signal?: AbortSignal;
  /** Default true (design §5.5). */
  retry429?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_429_RETRIES = 2;
const MAX_RETRY_AFTER_SEC = 10;

/** Minimal shape of the fetch Response we rely on (keeps tests and RN polyfills honest). */
interface FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = `${env.apiBaseUrl}/api/v1${path}`;
  if (!query) return base;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  if (parts.length === 0) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${parts.join('&')}`;
}

function isFormData(body: unknown): boolean {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value == null) return undefined;
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError({ kind: 'aborted' }));
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(new ApiError({ kind: 'aborted' }));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** One network attempt with timeout + caller-abort handling. */
async function fetchOnce(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | FormData },
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<FetchResponse> {
  if (signal?.aborted) throw new ApiError({ kind: 'aborted' });
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });
  try {
    return (await fetch(url, { ...init, signal: controller.signal })) as unknown as FetchResponse;
  } catch (e) {
    if (timedOut) throw new ApiError({ kind: 'timeout' });
    if (signal?.aborted || controller.signal.aborted) throw new ApiError({ kind: 'aborted' });
    if (isApiError(e)) throw e;
    throw new ApiError({ kind: 'network', message: e instanceof Error ? e.message : String(e) });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

async function readBody(res: FetchResponse): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function errorFromResponse(res: FetchResponse, text: string): ApiError {
  const retryAfterSec =
    res.status === 429 ? parseRetryAfter(res.headers.get('retry-after')) : undefined;
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  const envelope = apiErrorSchema.safeParse(json);
  if (envelope.success) {
    return new ApiError({
      kind: 'http',
      status: res.status,
      code: envelope.data.error,
      message: envelope.data.message,
      correlationId: envelope.data.correlationId,
      retryAfterSec,
    });
  }
  return new ApiError({
    kind: 'http',
    status: res.status,
    code: 'RequestFailed',
    message: `Request failed (${res.status})`,
    retryAfterSec,
  });
}

/** Sends with the given Bearer (or none), applying the 429 policy. Returns the raw response. */
async function send(
  path: string,
  opts: RequestOptions,
  token: string | null,
): Promise<{ res: FetchResponse; text: string }> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    [CLIENT_PLATFORM_HEADER]: MOBILE_CLIENT_PLATFORM,
  };
  let body: string | FormData | undefined;
  if (opts.body !== undefined) {
    if (isFormData(opts.body)) {
      body = opts.body as FormData; // RN sets the multipart boundary itself.
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (opts.cart) headers['x-guest-token'] = await getGuestToken();

  const url = buildUrl(path, opts.query);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allow429 = opts.retry429 !== false;

  for (let attempt = 0; ; attempt++) {
    const res = await fetchOnce(url, { method, headers, body }, timeoutMs, opts.signal);
    const text = await readBody(res);
    if (res.status === 429 && allow429 && attempt < MAX_429_RETRIES) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      if (retryAfter !== undefined && retryAfter <= MAX_RETRY_AFTER_SEC) {
        await sleep(retryAfter * 1000 + Math.floor(Math.random() * 250), opts.signal);
        continue;
      }
    }
    return { res, text };
  }
}

function parseSuccess<T>(text: string): T {
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError({ kind: 'parse', message: 'Invalid JSON in response' });
  }
}

async function resolveToken(auth: AuthMode): Promise<string | null> {
  if (auth === 'none') return null;
  if (sessionStore.status === 'authenticated') {
    try {
      return await tokenManager.getValidAccessToken();
    } catch (e) {
      if (isApiError(e) && e.kind === 'auth' && auth === 'optional') return null;
      throw e;
    }
  }
  if (auth === 'required') {
    throw new ApiError({ kind: 'auth', status: 401, code: 'NotAuthenticated' });
  }
  return null;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth ?? 'none';
  const token = await resolveToken(auth);

  let { res, text } = await send(path, opts, token);

  if (res.status === 401 && token) {
    // Reactive refresh (single-flight), then retry exactly once.
    const fresh = await tokenManager.refresh({ force: true, failedToken: token });
    ({ res, text } = await send(path, opts, fresh));
    if (res.status === 401) {
      await tokenManager.expireSession('unauthorized');
      throw new ApiError({ kind: 'auth', status: 401, code: 'SessionExpired' });
    }
  }

  if (!res.ok) throw errorFromResponse(res, text);
  return parseSuccess<T>(text);
}
