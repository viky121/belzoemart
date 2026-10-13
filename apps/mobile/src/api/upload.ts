import * as Crypto from 'expo-crypto';

import { apiRequest } from './client';

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Multipart image upload (design §5.7). The caller normalises the image first (expo-image-manipulator:
 * ≤1600 px long edge, JPEG 0.8), so the name/type below are always accurate.
 */
export function uploadImage(path: string, localUri: string): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', {
    uri: localUri,
    name: `return-${Crypto.randomUUID()}.jpg`,
    type: 'image/jpeg',
  } as never);
  return apiRequest<UploadResult>(path, {
    method: 'POST',
    body: form,
    auth: 'required',
    timeoutMs: 60_000,
    retry429: false,
  });
}
