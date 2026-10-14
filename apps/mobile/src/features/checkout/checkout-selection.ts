import type { Address } from '@/api/types';

export type CheckoutMethod = 'cod' | 'upi';

/**
 * Pick the checkout address (design §11): the param id when present in the list,
 * else the default, else the first, else none.
 */
export function selectCheckoutAddress(addresses: Address[], paramId?: string): Address | null {
  if (paramId) {
    const match = addresses.find((a) => a.id === paramId);
    if (match) return match;
  }
  return addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

/** Available payment methods (design §11): COD and/or online UPI. */
export function availableMethods(codEnabled: boolean, onlineEnabled: boolean): CheckoutMethod[] {
  const methods: CheckoutMethod[] = [];
  if (codEnabled) methods.push('cod');
  if (onlineEnabled) methods.push('upi');
  return methods;
}

/** Preselect: the only method, or COD when both are offered (design §11). */
export function preselectMethod(methods: CheckoutMethod[]): CheckoutMethod | null {
  if (methods.length === 0) return null;
  if (methods.length === 1) return methods[0]!;
  return 'cod';
}
