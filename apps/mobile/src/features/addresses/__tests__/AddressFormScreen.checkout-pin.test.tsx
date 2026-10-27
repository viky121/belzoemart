import { fireEvent } from '@testing-library/react-native';
import type { RootScreenProps } from '@/navigation/types';
import { renderWithProviders } from '@/test-utils';
import { AddressFormScreen } from '../screens/AddressFormScreen';

/** Adding an address for checkout: a PIN code we do not deliver to is refused on the form itself. */
let serviceable = false;
const reply = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

beforeEach(() => {
  globalThis.fetch = jest.fn((url: string) => {
    if (url.includes('/settings/serviceability')) return reply({ serviceable, configured: true });
    return reply([]);
  }) as unknown as typeof fetch;
});

function props(params: Record<string, unknown>): RootScreenProps<'AddressForm'> {
  const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn(), popTo: jest.fn() };
  return { navigation: navigation as never, route: { key: 'AddressForm-1', name: 'AddressForm', params } as never };
}

it('says so on the form when the PIN is not one we deliver to, and blocks Save', async () => {
  serviceable = false;
  const screen = await renderWithProviders(<AddressFormScreen {...props({ selectForCheckout: true })} />, { navigation: false });
  fireEvent.changeText(screen.getByLabelText('PIN code'), '110001');
  expect(await screen.findByTestId('pin-bad', {}, { timeout: 2000 })).toHaveTextContent(/don't deliver to PIN code 110001/);
  expect(screen.queryByTestId('pin-ok')).toBeNull();
  expect(screen.getByTestId('address-save')).toBeDisabled();
});
