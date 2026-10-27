import { fireEvent } from '@testing-library/react-native';
import type { RootScreenProps } from '@/navigation/types';
import { renderWithProviders } from '@/test-utils';
import { AddressFormScreen } from '../screens/AddressFormScreen';

/** A PIN we deliver to is confirmed on the checkout form; the same form outside checkout asks nothing. */
const reply = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

beforeEach(() => {
  globalThis.fetch = jest.fn((url: string) => {
    if (url.includes('/settings/serviceability')) return reply({ serviceable: true, configured: true });
    return reply([]);
  }) as unknown as typeof fetch;
});

function props(params: Record<string, unknown>): RootScreenProps<'AddressForm'> {
  const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn(), popTo: jest.fn() };
  return { navigation: navigation as never, route: { key: 'AddressForm-1', name: 'AddressForm', params } as never };
}

it('confirms a PIN we deliver to when adding an address for checkout', async () => {
  const screen = await renderWithProviders(<AddressFormScreen {...props({ selectForCheckout: true })} />, { navigation: false });
  fireEvent.changeText(screen.getByLabelText('PIN code'), '472001');
  expect(await screen.findByTestId('pin-ok', {}, { timeout: 2000 })).toHaveTextContent('We deliver to 472001');
  expect(screen.queryByTestId('pin-bad')).toBeNull();
});
