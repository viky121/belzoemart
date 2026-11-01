import type { PickupInfo } from '@belzo/shared';
import { apiFetch } from './api-client';

/**
 * Self pickup information (public): whether pickup is on, the timings note, the shop address and the
 * day/time slots on offer right now. Never cached, because the slots depend on the time of the request.
 * Returns null when it cannot be had; the checkout then simply offers home delivery.
 */
export async function fetchPickupInfo(): Promise<PickupInfo | null> {
  try {
    return await apiFetch<PickupInfo>('/checkout/pickup');
  } catch {
    return null;
  }
}
