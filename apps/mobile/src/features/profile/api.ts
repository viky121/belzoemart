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
