import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { apiRequest } from '@/api/client';
import { createTestQueryClient, renderWithProviders } from '@/test-utils';

import { LoginScreen } from '../screens/LoginScreen';

jest.mock('@/api/client', () => ({ apiRequest: jest.fn() }));
jest.mock('../session', () => ({ completeLogin: jest.fn(async () => undefined) }));

const mockApi = apiRequest as jest.Mock;
const AUTH = {
  accessToken: 'a',
  expiresIn: 900,
  refreshToken: 'r',
  customer: { id: 'c1', name: 'Ravi', email: null, phone: '9412807767', locale: 'en' },
};

const navigation = { navigate: jest.fn(), dispatch: jest.fn() };
const renderScreen = () =>
  renderWithProviders(
    <LoginScreen navigation={navigation as never} route={{ key: 'k', name: 'Login' } as never} />,
    { navigation: false, queryClient: createTestQueryClient() },
  );

beforeEach(() => {
  mockApi.mockReset();
  navigation.navigate.mockReset();
  navigation.dispatch.mockReset();
});

async function signIn(id: string, password = 'Belzo@2026') {
  await fireEvent.changeText(screen.getByLabelText('Mobile number or email'), id);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await fireEvent.press(screen.getByTestId('login-password-submit'));
}

describe('LoginScreen', () => {
  it('has no OTP option: just mobile-or-email and password', async () => {
    await renderScreen();
    expect(screen.queryByText('Mobile OTP')).toBeNull();
    expect(screen.queryByText('Send code')).toBeNull();
    expect(screen.getByLabelText('Mobile number or email')).toBeTruthy();
  });

  it('signs in with the mobile number', async () => {
    mockApi.mockResolvedValue(AUTH);
    await renderScreen();
    await signIn('+91 94128 07767');
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(mockApi.mock.calls[0][0]).toBe('/auth/login/identifier');
    expect(mockApi.mock.calls[0][1].body).toEqual({ identifier: '9412807767', password: 'Belzo@2026' });
    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
  });

  it('signs in with the email', async () => {
    mockApi.mockResolvedValue(AUTH);
    await renderScreen();
    await signIn(' Ravi@Example.com ');
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(mockApi.mock.calls[0][1].body).toEqual({ identifier: 'ravi@example.com', password: 'Belzo@2026' });
  });

  it('does not call the server for an invalid id or an empty password', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Mobile number or email'), '12345');
    await fireEvent.press(screen.getByTestId('login-password-submit'));
    expect(await screen.findByText('Enter a valid mobile number or email')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('offers Forgot password and Create an account', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('login-forgot'));
    expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword', { redirect: undefined });
    await fireEvent.press(screen.getByText('Create an account'));
    expect(navigation.navigate).toHaveBeenCalledWith('Register', { redirect: undefined });
  });
});
