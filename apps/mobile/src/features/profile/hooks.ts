import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { CustomerProfile } from '@/api/types';
import { useSessionStore } from '@/store/session';

import { fetchProfile, updateProfile, type ProfilePatch } from './api';

export function useProfile() {
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  return useQuery<CustomerProfile>({
    queryKey: qk.me,
    queryFn: fetchProfile,
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
      useSessionStore.getState().setAuthenticated({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        locale: (profile.locale === 'hi' ? 'hi' : 'en'),
      });
    },
  });
}
