import { renderToStaticMarkup } from 'react-dom/server';
import { emptyAddressForm } from '@/lib/address-form';
import { AddressFormView } from './address-manager';
import { ProfilePhotoEditor, initialsOf } from './profile-photo-editor';

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 't', customer: { id: 'c1', name: 'Asha Rao', phone: '9876543210', email: null }, authFetch: jest.fn() }),
}));

describe('initialsOf', () => {
  it('uses the first and last name', () => {
    expect(initialsOf('Asha Rao')).toBe('AR');
    expect(initialsOf('  mukesh   kumar jain ')).toBe('MJ');
    expect(initialsOf('Rajesh')).toBe('R');
    expect(initialsOf('')).toBe('');
  });
});

describe('ProfilePhotoEditor', () => {
  it('shows the saved photo and offers to change it', () => {
    const html = renderToStaticMarkup(<ProfilePhotoEditor photoUrl="/api/uploads/profile/a.jpg" name="Asha Rao" onChanged={() => undefined} />);
    expect(html).toContain('src="/api/uploads/profile/a.jpg"');
    expect(html).toContain('Change photo');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
  });
  it('shows initials and "Add photo" when there is no photo yet', () => {
    const html = renderToStaticMarkup(<ProfilePhotoEditor photoUrl={null} name="Asha Rao" onChanged={() => undefined} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('AR');
    expect(html).toContain('Add photo');
  });
});

describe('AddressFormView', () => {
  it('opens filled with the saved values, and the default box ticked for the default address', () => {
    const html = renderToStaticMarkup(
      <AddressFormView
        initial={{ ...emptyAddressForm({ fullName: 'Mukesh Jain', phone: '8770423034' }), pincode: '472001', line1: 'Shanti nagar', line2: 'Laxmi palace', city: 'Tikamgarh', state: 'Madhya Pradesh' }}
        addressId="a1"
        isDefault
        onSaved={() => undefined}
        onCancel={() => undefined}
      />,
    );
    for (const v of ['Mukesh Jain', '8770423034', '472001', 'Shanti nagar', 'Laxmi palace', 'Tikamgarh', 'Madhya Pradesh']) expect(html).toContain(`value="${v}"`);
    expect(html).toMatch(/data-testid="af-default"[^>]*checked=""|checked=""[^>]*data-testid="af-default"/);
    expect(html).toContain('Save address');
  });
});
