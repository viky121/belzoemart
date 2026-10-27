/** Helpers for the saved-address form on the My Account page (no I/O, easy to test). */

export type AddressLabel = 'home' | 'work' | 'other';

export interface AddressForm {
  label: AddressLabel;
  fullName: string;
  phone: string;
  pincode: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
}

export interface SavedAddress {
  id: string;
  label: string;
  fullName?: string;
  phone?: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export const emptyAddressForm = (prefill: { fullName?: string; phone?: string } = {}): AddressForm => ({
  label: 'home',
  fullName: prefill.fullName ?? '',
  phone: prefill.phone ?? '',
  pincode: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
});

const LABELS: AddressLabel[] = ['home', 'work', 'other'];

export function addressToForm(a: SavedAddress): AddressForm {
  return {
    label: (LABELS as string[]).includes(a.label) ? (a.label as AddressLabel) : 'other',
    fullName: a.fullName ?? '',
    phone: (a.phone ?? '').replace(/\D/g, '').slice(-10),
    pincode: a.pincode,
    line1: a.line1,
    line2: a.line2 ?? '',
    city: a.city,
    state: a.state,
  };
}

/** The first thing wrong with the form in plain words, or null when it can be saved. */
export function validateAddressForm(f: AddressForm): string | null {
  if (!f.fullName.trim() || !f.phone.trim() || !f.line1.trim() || !f.city.trim() || !f.state.trim() || !f.pincode.trim()) {
    return 'Please fill name, phone, address, city, state and PIN code.';
  }
  if (!/^(\+?91)?[6-9]\d{9}$/.test(f.phone.replace(/\s/g, ''))) return 'Enter a valid 10-digit mobile number.';
  if (!/^[1-9]\d{5}$/.test(f.pincode.trim())) return 'Enter a valid 6-digit PIN code.';
  return null;
}

/** The request body: trimmed values, a 10-digit phone, and "Address line 2" always sent so emptying it clears it. */
export function addressBody(f: AddressForm): AddressForm {
  return {
    label: f.label,
    fullName: f.fullName.trim(),
    phone: f.phone.replace(/\D/g, '').slice(-10),
    pincode: f.pincode.trim(),
    line1: f.line1.trim(),
    line2: f.line2.trim(),
    city: f.city.trim(),
    state: f.state.trim(),
  };
}

/** "line1, line2, city, state - pincode" for a card. */
export function addressLine(a: Pick<SavedAddress, 'line1' | 'line2' | 'city' | 'state' | 'pincode'>): string {
  const street = [a.line1, a.line2].filter((p) => p && p.trim()).join(', ');
  return `${street}, ${a.city}, ${a.state} - ${a.pincode}`;
}
