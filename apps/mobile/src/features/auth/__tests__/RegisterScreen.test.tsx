import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { apiRequest } from '@/api/client';
import { createTestQueryClient, renderWithProviders } from '@/test-utils';

import { RegisterScreen } from '../screens/RegisterScreen';

jest.mock('@/api/client', () => ({ apiRequest: jest.fn() }));
jest.mock('../session', () => ({ completeLogin: jest.fn(async () => undefined) }));

const mockApi = apiRequest as jest.Mock;
const PHONE_PROOF = 'phone-proof-'.padEnd(40, 'x');
const EMAIL_PROOF = 'email-proof-'.padEnd(40, 'y');

const AUTH = {
  accessToken: 'a',
  expiresIn: 900,
  refreshToken: 'r',
  customer: { id: 'c1', name: 'Ravi Kumar', email: 'ravi@example.com', phone: '9412807767', locale: 'en' },
};

beforeEach(() => {
  mockApi.mockReset();
  mockApi.mockImplementation(async (path: string, opts: { body?: Record<string, unknown> }) => {
    if (path === '/auth/otp/request') return { requestId: '11111111-1111-4111-8111-111111111111', expiresAt: 'x' };
    if (path === '/auth/otp/prove') {
      return opts.body?.code === '123456'
        ? { proof: PHONE_PROOF, kind: 'phone', value: '9412807767' }
        : { proof: EMAIL_PROOF, kind: 'email', value: 'ravi@example.com' };
    }
    if (path === '/auth/register') return AUTH;
    throw new Error(`unexpected ${path}`);
  });
});

const navigation = { navigate: jest.fn(), dispatch: jest.fn(), goBack: jest.fn() };
const renderScreen = () =>
  renderWithProviders(
    <RegisterScreen navigation={navigation as never} route={{ key: 'k', name: 'Register' } as never} />,
    { navigation: false, queryClient: createTestQueryClient() },
  );

describe('RegisterScreen', () => {
  it('keeps "Create account" off until the mobile is verified and the password is strong', async () => {
    await renderScreen();
    expect(screen.getByTestId('register-submit')).toBeDisabled();
    expect(screen.getByText(/Verify your mobile number and set a strong password to continue\./)).toBeTruthy();
    // the verify rows only appear once the number / email look valid
    expect(screen.queryByTestId('register-phone-otp')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '94128 07767');
    expect(screen.getByTestId('register-phone-otp-send')).toBeTruthy();
  });

  it('verifies both by OTP, then creates the account with the proofs and the password twice', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ravi Kumar');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9412807767');
    await fireEvent.changeText(screen.getByLabelText('Email (optional)'), 'Ravi@Example.com');

    await fireEvent.press(screen.getByTestId('register-phone-otp-send'));
    const codes = await screen.findAllByLabelText('6-digit code');
    await fireEvent.changeText(codes[0]!, '123456');
    await fireEvent.press(screen.getByTestId('register-phone-otp-verify'));
    expect(await screen.findByTestId('register-phone-otp-verified')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('register-email-otp-send'));
    const emailCode = await screen.findByLabelText('6-digit code');
    await fireEvent.changeText(emailCode, '654321');
    await fireEvent.press(screen.getByTestId('register-email-otp-verify'));
    expect(await screen.findByTestId('register-email-otp-verified')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'Belzo@2026');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Belzo@2026');
    await waitFor(() => expect(screen.getByTestId('register-submit')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() => {
      const call = mockApi.mock.calls.find(([p]) => p === '/auth/register');
      expect(call).toBeTruthy();
      expect(call![1].body).toEqual({
        name: 'Ravi Kumar',
        email: 'ravi@example.com',
        phone: '9412807767',
        password: 'Belzo@2026',
        confirmPassword: 'Belzo@2026',
        phoneProof: PHONE_PROOF,
        emailProof: EMAIL_PROOF,
      });
    });
    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalled());
  });

  async function verifyPhone() {
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ravi Kumar');
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9412807767');
    await fireEvent.press(screen.getByTestId('register-phone-otp-send'));
    const code = await screen.findByLabelText('6-digit code');
    await fireEvent.changeText(code, '123456');
    await fireEvent.press(screen.getByTestId('register-phone-otp-verify'));
    expect(await screen.findByTestId('register-phone-otp-verified')).toBeTruthy();
  }

  it('creates the account without an email: only the mobile proof is sent', async () => {
    await renderScreen();
    await verifyPhone();
    expect(screen.queryByTestId('register-email-otp')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Belzo@2026');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Belzo@2026');
    await waitFor(() => expect(screen.getByTestId('register-submit')).toBeEnabled());
    await fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() => {
      const call = mockApi.mock.calls.find(([p]) => p === '/auth/register');
      expect(call).toBeTruthy();
      expect(call![1].body).toEqual({
        name: 'Ravi Kumar',
        phone: '9412807767',
        password: 'Belzo@2026',
        confirmPassword: 'Belzo@2026',
        phoneProof: PHONE_PROOF,
      });
    });
  });

  it('a typed email has to be verified first, and clearing it lets the account be created', async () => {
    await renderScreen();
    await verifyPhone();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'Belzo@2026');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Belzo@2026');
    await waitFor(() => expect(screen.getByTestId('register-submit')).toBeEnabled());

    await fireEvent.changeText(screen.getByLabelText('Email (optional)'), 'ravi@example.com');
    await waitFor(() => expect(screen.getByTestId('register-submit')).toBeDisabled());
    expect(screen.getByText(/Verify the email too, or clear it/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Email (optional)'), '');
    await waitFor(() => expect(screen.getByTestId('register-submit')).toBeEnabled());
  });

  it('a verification does not carry over when the number is changed', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9412807767');
    await fireEvent.press(screen.getByTestId('register-phone-otp-send'));
    const code = await screen.findByLabelText('6-digit code');
    await fireEvent.changeText(code, '123456');
    await fireEvent.press(screen.getByTestId('register-phone-otp-verify'));
    expect(await screen.findByTestId('register-phone-otp-verified')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9000000001');
    expect(screen.queryByTestId('register-phone-otp-verified')).toBeNull();
    expect(screen.getByTestId('register-phone-otp-send')).toBeTruthy();
  });
});
