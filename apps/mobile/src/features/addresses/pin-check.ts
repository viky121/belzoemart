import { apiRequest } from '@/api/client';

export interface PinServiceability {
  serviceable: boolean;
  configured: boolean;
}

/** `ok` we deliver there, `bad` we do not, `unknown` no answer (the server still checks when the order is placed). */
export type PinVerdict = 'ok' | 'bad' | 'unknown';

/** Is this PIN on the shop's list of delivery PIN codes? Never throws; null when the answer could not be had. */
export async function fetchPinServiceability(pin: string): Promise<PinServiceability | null> {
  try {
    return await apiRequest<PinServiceability>('/settings/serviceability', { query: { pincode: pin } });
  } catch {
    return null;
  }
}

/** A PIN is refused only when the shop has a delivery list and the PIN is not on it. */
export function pinVerdict(result: PinServiceability | null | undefined): PinVerdict {
  if (!result) return 'unknown';
  return result.configured && !result.serviceable ? 'bad' : 'ok';
}

export const pinRefusal = (pin: string) =>
  `Sorry, we don't deliver to PIN code ${pin} yet. Please enter a PIN code we deliver to.`;
