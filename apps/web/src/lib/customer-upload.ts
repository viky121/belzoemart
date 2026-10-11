'use client';

import { compressImage } from './image-compress';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

// Keep in sync with the API's CUSTOMER_IMAGE_MAX_BYTES (customer-image-upload.ts).
const SERVER_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Upload an image as an authenticated customer. Large photos are downscaled in
 * the browser first so uploads never trip the server size limit (an over-limit
 * body gets reset mid-stream and the browser reports a raw
 * `net::ERR_CONNECTION_RESET` instead of the real error). Returns the public URL.
 */
async function uploadCustomerImage(
  file: File,
  accessToken: string | undefined,
  path: string,
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

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
  } catch {
    throw new Error(
      'Upload could not reach the server (the connection dropped). ' +
        'This usually means the image was too large — try a smaller one.',
    );
  }

  if (!res.ok) {
    const msg = await res
      .json()
      .then((d) => d.message as string)
      .catch(() => 'Upload failed');
    throw new Error(msg || 'Upload failed');
  }
  return res.json();
}

/** Upload a product-review photo. */
export function uploadReviewImage(file: File, accessToken?: string): Promise<{ url: string; key: string }> {
  return uploadCustomerImage(file, accessToken, '/reviews/media/upload');
}

/** Upload a return-request photo (stored under returns/). */
export function uploadReturnImage(file: File, accessToken?: string): Promise<{ url: string; key: string }> {
  return uploadCustomerImage(file, accessToken, '/orders/returns/media/upload');
}
