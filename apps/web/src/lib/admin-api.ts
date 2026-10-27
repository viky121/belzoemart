'use client';

import { apiBaseUrl } from './api-base';
import { apiFetch, ApiClientError, type ApiRequestOptions } from './api-client';
import { compressImage } from './image-compress';

/**
 * Admin API client. Admin auth uses a separate httpOnly refresh cookie
 * (/api/v1/admin/auth). The access token is held in memory here; on a 401 we
 * refresh once and retry. Kept module-local (admin runs in its own routes).
 */
let adminAccessToken: string | null = null;

export function setAdminToken(token: string | null): void {
  adminAccessToken = token;
}

export async function adminLogin(email: string, password: string, mfaCode?: string): Promise<void> {
  const res = await apiFetch<{ accessToken: string }>('/admin/auth/login', {
    method: 'POST',
    body: { email, password, ...(mfaCode ? { mfaCode } : {}) },
  });
  adminAccessToken = res.accessToken;
}

export async function adminLogout(): Promise<void> {
  await apiFetch('/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
  adminAccessToken = null;
}

// A single shared refresh promise so concurrent 401s (e.g. the catalogue page
// firing products/categories/brands in parallel) don't each rotate the refresh
// token — token rotation would otherwise flag the 2nd/3rd as reuse and revoke
// the whole session, which is what forced a re-login.
let refreshInFlight: Promise<string | null> | null = null;

function refreshAdminToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = apiFetch<{ accessToken: string }>('/admin/auth/refresh', { method: 'POST' })
      .then((r) => {
        adminAccessToken = r.accessToken;
        return r.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function adminFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, { ...options, accessToken: adminAccessToken ?? undefined });
  } catch (err) {
    if (err instanceof ApiClientError && err.payload.statusCode === 401) {
      const token = await refreshAdminToken();
      if (token) {
        return apiFetch<T>(path, { ...options, accessToken: token });
      }
    }
    throw err;
  }
}

/**
 * Downloads a file the API builds (e.g. a report as CSV). A plain link cannot carry the admin login (the
 * token lives in memory), so the file is fetched with it and handed to the browser as a download.
 */
export async function adminDownload(path: string, filename: string): Promise<void> {
  const url = `${apiBaseUrl()}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  const send = (token: string | null) =>
    fetch(url, { credentials: 'include', headers: token ? { authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
  let token = adminAccessToken ?? (await refreshAdminToken());
  let res = await send(token);
  if (res.status === 401) {
    token = await refreshAdminToken();
    if (token) res = await send(token);
  }
  if (!res.ok) {
    const message = await res
      .json()
      .then((d: { message?: string }) => d.message)
      .catch(() => undefined);
    throw new Error(message || (res.status === 403 ? 'You do not have access to this report.' : 'Could not download the file.'));
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export function hasAdminToken(): boolean {
  return adminAccessToken !== null;
}

/** A single already-stored media object (mirrors the API `MediaItem` shape). */
export interface MediaItem {
  key: string;
  url: string;
  folder: string;
  name: string;
  size: number;
  lastModified: string | null;
}

/**
 * List already-uploaded server images for the admin media library (read-only).
 * Optionally scoped to a known `folder`. Returns `{ items: [] }` when listing
 * is unavailable (e.g. S3 without ListBucket), so the picker degrades to
 * upload-only rather than erroring.
 */
export async function adminListMedia(folder?: string): Promise<{ items: MediaItem[] }> {
  const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';
  return adminFetch<{ items: MediaItem[] }>(`/admin/media${qs}`);
}

// Server cap (apps/api media.controller MAX_BYTES). Keep in sync. We reject
// oversized bodies here so the user gets a clear message instead of a raw
// `net::ERR_CONNECTION_RESET` — which is what the browser shows when the API
// closes an over-limit upload mid-stream.
const SERVER_MAX_BYTES = 15 * 1024 * 1024;

/** Upload failure; `status` is the HTTP status when the server answered (e.g. 429). */
export class AdminUploadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AdminUploadError';
  }
}

/**
 * Upload an image file to the admin media endpoint (stored via S3 in prod).
 * Large photos are downscaled in the browser first so uploads stay small and
 * never trip the server's size limit. Returns the public URL to save on the
 * product/banner/category record.
 */
export async function adminUpload(
  file: File,
  folder: 'products' | 'banners' | 'categories' | 'brands' | 'misc' = 'misc',
): Promise<{ url: string; key: string }> {
  const prepared = await compressImage(file).catch(() => file);
  if (prepared.size > SERVER_MAX_BYTES) {
    throw new Error(
      `Image is too large (${(prepared.size / (1024 * 1024)).toFixed(1)} MB). ` +
        'Please use an image under 15 MB.',
    );
  }

  const form = new FormData();
  form.append('file', prepared);
  form.append('folder', folder);

  const send = (token: string | null) =>
    fetch(`${apiBaseUrl()}/api/v1/admin/media/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    });

  let res: Response;
  try {
    // The access token only lives 15 minutes and is kept in memory, so after a long form or a page reload
    // it is missing/expired. Refresh it first (like adminFetch does) instead of failing the upload.
    let token = adminAccessToken ?? (await refreshAdminToken());
    res = await send(token);
    if (res.status === 401) {
      token = await refreshAdminToken();
      if (token) res = await send(token);
    }
    // Several images in a row can trip the API rate limit (429): wait a moment and try once more.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await send(adminAccessToken);
    }
  } catch {
    // Network-level failure (connection reset/offline). Give an actionable hint
    // rather than the browser's opaque "Failed to fetch".
    throw new Error(
      prepared.size > 5 * 1024 * 1024
        ? 'Upload could not reach the server (the connection dropped). The image is large, try a smaller one.'
        : 'Upload could not reach the server. Check your internet connection and try again.',
    );
  }

  if (!res.ok) {
    const msg = await res
      .json()
      .then((d) => d.message as string)
      .catch(() => 'Upload failed');
    throw new AdminUploadError(msg || 'Upload failed', res.status);
  }
  return res.json();
}
