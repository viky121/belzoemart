import type { AddressInput } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { Address } from '@/api/types';

export function fetchAddresses(): Promise<Address[]> {
  return apiRequest<Address[]>('/me/addresses', { auth: 'required' });
}

export function createAddress(body: AddressInput, makeDefault: boolean): Promise<Address> {
  return apiRequest<Address>('/me/addresses', {
    method: 'POST',
    auth: 'required',
    query: makeDefault ? { default: 'true' } : undefined,
    body,
  });
}

export function updateAddress(id: string, body: AddressInput, makeDefault: boolean): Promise<Address> {
  return apiRequest<Address>(`/me/addresses/${id}`, {
    method: 'PUT',
    auth: 'required',
    query: makeDefault ? { default: 'true' } : undefined,
    body,
  });
}

export function deleteAddress(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/me/addresses/${id}`, { method: 'DELETE', auth: 'required' });
}

export function resolvePincode(pincode: string): Promise<{ city: string | null; state: string | null }> {
  return apiRequest<{ city: string | null; state: string | null }>('/me/addresses/resolve-pincode', {
    auth: 'required',
    query: { pincode },
  });
}
