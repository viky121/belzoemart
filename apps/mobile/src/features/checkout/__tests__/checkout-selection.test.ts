import type { Address } from '@/api/types';

import { availableMethods, preselectMethod, selectCheckoutAddress } from '../checkout-selection';

function addr(id: string, isDefault = false): Address {
  return {
    id,
    isDefault,
    createdAt: '',
    updatedAt: '',
    label: 'home',
    fullName: 'N',
    phone: '9999999999',
    line1: 'L1',
    line2: undefined,
    city: 'City',
    state: 'Delhi',
    pincode: '110001',
  };
}

describe('selectCheckoutAddress', () => {
  const list = [addr('a1'), addr('a2', true), addr('a3')];

  it('prefers a valid param id', () => {
    expect(selectCheckoutAddress(list, 'a3')?.id).toBe('a3');
  });
  it('falls back to the default when the param id is not in the list', () => {
    expect(selectCheckoutAddress(list, 'nope')?.id).toBe('a2');
  });
  it('falls back to the default with no param', () => {
    expect(selectCheckoutAddress(list, undefined)?.id).toBe('a2');
  });
  it('falls back to the first when there is no default', () => {
    expect(selectCheckoutAddress([addr('a1'), addr('a2')], undefined)?.id).toBe('a1');
  });
  it('returns null for an empty list', () => {
    expect(selectCheckoutAddress([], 'x')).toBeNull();
  });
});

describe('availableMethods / preselectMethod', () => {
  it('offers nothing when neither is enabled', () => {
    expect(availableMethods(false, false)).toEqual([]);
    expect(preselectMethod([])).toBeNull();
  });
  it('offers and preselects COD only', () => {
    const m = availableMethods(true, false);
    expect(m).toEqual(['cod']);
    expect(preselectMethod(m)).toBe('cod');
  });
  it('offers and preselects online only', () => {
    const m = availableMethods(false, true);
    expect(m).toEqual(['upi']);
    expect(preselectMethod(m)).toBe('upi');
  });
  it('offers both and preselects COD', () => {
    const m = availableMethods(true, true);
    expect(m).toEqual(['cod', 'upi']);
    expect(preselectMethod(m)).toBe('cod');
  });
});
