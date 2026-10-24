import { addressBody, addressLine, addressToForm, emptyAddressForm, validateAddressForm, type AddressForm, type SavedAddress } from './address-form';

const good = (over: Partial<AddressForm> = {}): AddressForm => ({
  label: 'home', fullName: 'Mukesh Jain', phone: '8770423034', pincode: '472001', line1: 'Shanti nagar', line2: 'Laxmi palace', city: 'Tikamgarh', state: 'Madhya Pradesh', ...over,
});

describe('validateAddressForm', () => {
  it('accepts a complete address', () => {
    expect(validateAddressForm(good())).toBeNull();
    expect(validateAddressForm(good({ line2: '' }))).toBeNull();
    expect(validateAddressForm(good({ phone: '+91 87704 23034' }))).toBeNull();
  });
  it.each([
    ['name', { fullName: ' ' }],
    ['phone', { phone: '' }],
    ['street', { line1: '' }],
    ['city', { city: '' }],
    ['state', { state: '' }],
    ['pin', { pincode: '' }],
  ])('asks for the missing %s', (_n, over) => {
    expect(validateAddressForm(good(over as Partial<AddressForm>))).toMatch(/Please fill/);
  });
  it('checks the phone and the PIN code', () => {
    expect(validateAddressForm(good({ phone: '12345' }))).toMatch(/10-digit mobile/);
    expect(validateAddressForm(good({ phone: '5876543210' }))).toMatch(/10-digit mobile/);
    expect(validateAddressForm(good({ pincode: '47200' }))).toMatch(/6-digit PIN/);
    expect(validateAddressForm(good({ pincode: '072001' }))).toMatch(/6-digit PIN/);
  });
});

describe('addressBody', () => {
  it('trims, keeps 10 phone digits, and always sends line 2 so it can be cleared', () => {
    expect(addressBody(good({ fullName: '  Mukesh Jain ', phone: '+91 87704 23034', line2: '   ', city: ' Tikamgarh ' }))).toEqual({
      label: 'home', fullName: 'Mukesh Jain', phone: '8770423034', pincode: '472001', line1: 'Shanti nagar', line2: '', city: 'Tikamgarh', state: 'Madhya Pradesh',
    });
  });
});

describe('addressToForm / addressLine', () => {
  const saved: SavedAddress = { id: 'a1', label: 'work', fullName: 'Asha', phone: '+919876543210', line1: '12 MG Road', line2: null, city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', isDefault: true };
  it('fills the edit form from a saved address (null line 2 becomes empty)', () => {
    expect(addressToForm(saved)).toEqual({ label: 'work', fullName: 'Asha', phone: '9876543210', pincode: '462001', line1: '12 MG Road', line2: '', city: 'Bhopal', state: 'Madhya Pradesh' });
    expect(addressToForm({ ...saved, label: 'weird' }).label).toBe('other');
  });
  it('writes one readable line', () => {
    expect(addressLine(saved)).toBe('12 MG Road, Bhopal, Madhya Pradesh - 462001');
    expect(addressLine({ ...saved, line2: 'Near park' })).toBe('12 MG Road, Near park, Bhopal, Madhya Pradesh - 462001');
  });
  it('starts a new form with the customer name and phone', () => {
    expect(emptyAddressForm({ fullName: 'Asha', phone: '9876543210' })).toMatchObject({ label: 'home', fullName: 'Asha', phone: '9876543210', line1: '' });
  });
});
