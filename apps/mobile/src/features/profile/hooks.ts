import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { CustomerProfile } from '@/api/types';
import { useSessionStore } from '@/store/session';

import { fetchProfile, updateProfile, type ProfilePatch } from './api';

/** Copy the identity fields of a profile into the session, so every screen shows the same name. */
function syncSession(profile: CustomerProfile): void {
  useSessionStore.getState().setAuthenticated({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    locale: profile.locale === 'hi' ? 'hi' : 'en',
  });
}

/**
 * The signed-in customer's profile. The session copy made at login can be out of date (a name
 * added on the web, or an account claimed during sign-up), so each fetch refreshes it too.
 */
export function useProfile() {
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  return useQuery<CustomerProfile>({
    queryKey: qk.me,
    queryFn: async () => {
      const profile = await fetchProfile();
      syncSession(profile);
      return profile;
    },
    enabled: isCustomer,
    staleTime: STALE.default,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => updateProfile(patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(qk.me, profile);
      syncSession(profile);
    },
  });
}
