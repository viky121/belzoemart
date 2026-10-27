import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { AddressFormScreen } from '../screens/AddressFormScreen';

/** Outside checkout (from the profile) the address form does not check delivery: only checkout does. */
const reply = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

beforeEach(() => {
  globalThis.fetch = jest.fn(() => reply([])) as unknown as typeof fetch;
});

it('asks nothing about delivery and shows no PIN message when not adding for checkout', async () => {
  const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn(), popTo: jest.fn() };
  const screen = await renderWithProviders(
    <AddressFormScreen navigation={navigation as never} route={{ key: 'AddressForm-1', name: 'AddressForm', params: {} } as never} />,
    { navigation: false },
  );
  fireEvent.changeText(screen.getByLabelText('PIN code'), '110001');
  await new Promise((r) => setTimeout(r, 100));
  const asked = (globalThis.fetch as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('/settings/serviceability'));
  expect(asked).toHaveLength(0);
  expect(screen.queryByTestId('pin-bad')).toBeNull();
  expect(screen.queryByTestId('pin-ok')).toBeNull();
});
