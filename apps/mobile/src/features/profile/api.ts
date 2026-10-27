import { profilePatchSchema } from '@belzo/shared';
import type { z } from 'zod';

import { apiRequest } from '@/api/client';
import type { CustomerProfile } from '@/api/types';

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export function fetchProfile(): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/me', { auth: 'required' });
}

export function updateProfile(patch: ProfilePatch): Promise<CustomerProfile> {
  return apiRequest<CustomerProfile>('/me', { method: 'PATCH', auth: 'required', body: patch });
}

export interface PhotoUpload {
  url: string;
  key: string;
}

/**
 * Uploads a profile picture as base64 text in a normal JSON request. File uploads (multipart) through the
 * phone's network layer fail with "network request failed" on some Android devices; plain JSON does not.
 */
export function uploadProfilePhoto(base64: string, mimeType = 'image/jpeg'): Promise<PhotoUpload> {
  return apiRequest<PhotoUpload>('/me/photo', {
    method: 'POST',
    auth: 'required',
    body: { image: base64, mimeType },
    timeoutMs: 60_000,
    retry429: false,
  });
}
