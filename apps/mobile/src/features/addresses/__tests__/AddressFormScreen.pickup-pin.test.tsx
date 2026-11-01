import { fireEvent } from '@testing-library/react-native';
import type { RootScreenProps } from '@/navigation/types';
import { renderWithProviders } from '@/test-utils';
import { AddressFormScreen } from '../screens/AddressFormScreen';

/**
 * Self pickup at checkout: the customer comes to the shop, so the address form does NOT refuse a PIN code that
 * the shop does not deliver to. (Home delivery still does; see AddressFormScreen.checkout-pin.test.tsx.)
 */
const reply = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });
let serviceabilityCalls = 0;
beforeEach(() => {
  serviceabilityCalls = 0;
  globalThis.fetch = jest.fn((url: string) => {
    if (url.includes('/settings/serviceability')) {
      serviceabilityCalls += 1;
      return reply({ serviceable: false, configured: true });
    }
    return reply([]);
  }) as unknown as typeof fetch;
});
function props(params: Record<string, unknown>): RootScreenProps<'AddressForm'> {
  const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn(), popTo: jest.fn() };
  return { navigation: navigation as never, route: { key: 'AddressForm-1', name: 'AddressForm', params } as never };
}

it('shows no "we do not deliver" message and does not block Save for a pickup customer', async () => {
  const screen = await renderWithProviders(<AddressFormScreen {...props({ selectForCheckout: true, pickup: true })} />, { navigation: false });
  fireEvent.changeText(screen.getByLabelText('PIN code'), '110001');
  // Give a (wrongly) fired check time to show up.
  await new Promise((r) => setTimeout(r, 400));
  expect(screen.queryByTestId('pin-bad')).toBeNull();
  expect(screen.queryByTestId('pin-ok')).toBeNull();
  expect(screen.getByTestId('address-save')).not.toBeDisabled();
  expect(serviceabilityCalls).toBe(0);
});
