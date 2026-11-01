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

/** Preselect: the only method, or online (UPI / card / net banking) when both are offered. */
export function preselectMethod(methods: CheckoutMethod[]): CheckoutMethod | null {
  if (methods.length === 0) return null;
  if (methods.length === 1) return methods[0]!;
  return 'upi';
}

/**
 * The payment method in force: the customer's own choice while it is still on offer, else the default
 * (online when it is offered, otherwise Cash on Delivery). Before the offer is known, online is assumed.
 */
export function resolveMethod(chosen: CheckoutMethod | null, methods: CheckoutMethod[]): CheckoutMethod {
  if (chosen && methods.includes(chosen)) return chosen;
  return preselectMethod(methods) ?? chosen ?? 'upi';
}
