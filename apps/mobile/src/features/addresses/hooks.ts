import type { AddressInput } from '@belzo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { Address } from '@/api/types';

import { createAddress, deleteAddress, fetchAddresses, resolvePincode, updateAddress } from './api';

export function useAddresses() {
  return useQuery<Address[]>({
    queryKey: qk.addresses,
    queryFn: fetchAddresses,
    staleTime: STALE.default,
  });
}

export function useSaveAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, makeDefault }: { id?: string; body: AddressInput; makeDefault: boolean }) =>
      id ? updateAddress(id, body, makeDefault) : createAddress(body, makeDefault),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.addresses }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAddress(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.addresses }),
  });
}

export function useResolvePincode() {
  return useMutation({ mutationFn: (pincode: string) => resolvePincode(pincode) });
}
