import { apiErrorSchema, type ApiError } from '@belzo/shared';

import { apiBaseUrl } from './api-base';

/**
 * Typed fetch wrapper for the Belzo API. Sends credentials (httpOnly refresh
 * cookie) and normalizes error responses into the shared ApiError envelope.
 * Access tokens are attached by callers that hold them (client components /
 * server actions). In the browser the base is same-origin (see api-base.ts).
 */

export class ApiClientError extends Error {
  constructor(readonly payload: ApiError) {
    super(payload.message);
    this.name = 'ApiClientError';
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  headers?: Record<string, string>;
  /** revalidate seconds for Next.js fetch cache (server components). */
  revalidate?: number;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = `${apiBaseUrl()}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    // Storefront read pages are `force-dynamic`, so fetches default to no-store.
    // (Avoids a Next 14.2 caching edge case with the `next.revalidate` option.)
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new ApiClientError(
      parsed.success
        ? parsed.data
        : { statusCode: res.status, error: 'RequestFailed', message: res.statusText },
    );
  }

  return data as T;
}
