import { apiFetch } from './api-client';

export interface PinServiceability {
  serviceable: boolean;
  configured: boolean;
}

/** `ok` we deliver there, `bad` we do not, `unknown` the answer could not be had (the server still checks at order time). */
export type PinVerdict = 'ok' | 'bad' | 'unknown';

/** The answer for one PIN code from the shop's list of delivery PIN codes. Never throws. */
export async function checkPin(pin: string): Promise<PinServiceability | null> {
  try {
    return await apiFetch<PinServiceability>(`/settings/serviceability?pincode=${encodeURIComponent(pin)}`);
  } catch {
    return null;
  }
}

/** A PIN is refused only when the shop has a delivery list and the PIN is not on it. */
export function pinVerdict(result: PinServiceability | null): PinVerdict {
  if (!result) return 'unknown';
  return result.configured && !result.serviceable ? 'bad' : 'ok';
}

export const pinRefusal = (pin: string) =>
  `Sorry, we don't deliver to PIN code ${pin} yet. Please enter a PIN code we deliver to.`;
