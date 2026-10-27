import { fireEvent, waitFor } from '@testing-library/react-native';
import { __testing, tokenManager } from '@/api/token-manager';
import { useSessionStore } from '@/store/session';
import { createTestQueryClient, renderWithProviders } from '@/test-utils';
import { ProfileEditScreen } from '../screens/ProfileEditScreen';

const PROFILE = { id: 'c1', name: 'Rajesh', email: null, phone: '8802307657', gender: null, dob: null, photoUrl: null, locale: 'en', status: 'active' };
const reply = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

describe('ProfileEditScreen', () => {
  beforeEach(async () => {
    __testing.reset();
    await tokenManager.setSession({ accessToken: 'access-1', expiresIn: 900, refreshToken: 'refresh-1' });
    useSessionStore.setState({ status: 'authenticated', customer: { id: 'c1', name: 'Rajesh', email: null, phone: '8802307657', locale: 'en' } } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  function setup() {
    const goBack = jest.fn();
    const patches: unknown[] = [];
    let current = { ...PROFILE };
    globalThis.fetch = jest.fn((_url: string, init?: { method?: string; body?: unknown }) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patches.push(body);
        current = { ...current, ...body };
        return reply(current);
      }
      return reply(current);
    }) as unknown as typeof fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navigation = { goBack } as any;
    return { goBack, patches, navigation };
  }

  it('sends only what changed, then shows the new name everywhere (session) and goes back', async () => {
    const { goBack, patches, navigation } = setup();
    const ui = await renderWithProviders(<ProfileEditScreen navigation={navigation} route={{ key: 'k', name: 'ProfileEdit' } as never} />, {
      navigation: false, queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(ui.getByLabelText('Full name').props.value).toBe('Rajesh'), { timeout: 3000 });
    await fireEvent.changeText(ui.getByLabelText('Full name'), 'Rajesh Kumar');
    await fireEvent.changeText(ui.getByLabelText('Email'), 'rajesh@shop.in');
    await fireEvent.press(ui.getByTestId('profile-save'));
    await waitFor(() => expect(goBack).toHaveBeenCalled(), { timeout: 3000 });
    expect(patches).toEqual([{ name: 'Rajesh Kumar', email: 'rajesh@shop.in' }]);
    expect(useSessionStore.getState().customer).toMatchObject({ name: 'Rajesh Kumar', email: 'rajesh@shop.in' });
  });

  it('does not call the server when nothing changed', async () => {
    const { goBack, patches, navigation } = setup();
    const ui = await renderWithProviders(<ProfileEditScreen navigation={navigation} route={{ key: 'k', name: 'ProfileEdit' } as never} />, {
      navigation: false, queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(ui.getByLabelText('Full name').props.value).toBe('Rajesh'), { timeout: 3000 });
    await fireEvent.press(ui.getByTestId('profile-save'));
    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(patches).toEqual([]);
  });

  it('shows the reason when the email belongs to someone else', async () => {
    const { goBack, navigation } = setup();
    (globalThis.fetch as jest.Mock).mockImplementation((_u: string, init?: { method?: string }) =>
      init?.method === 'PATCH'
        ? reply({ statusCode: 409, error: 'ConflictException', message: 'That email is already linked to another account.' }, 409)
        : reply(PROFILE),
    );
    const ui = await renderWithProviders(<ProfileEditScreen navigation={navigation} route={{ key: 'k', name: 'ProfileEdit' } as never} />, {
      navigation: false, queryClient: createTestQueryClient(),
    });
    await waitFor(() => expect(ui.getByLabelText('Full name').props.value).toBe('Rajesh'), { timeout: 3000 });
    await fireEvent.changeText(ui.getByLabelText('Email'), 'taken@x.in');
    await fireEvent.press(ui.getByTestId('profile-save'));
    expect(await ui.findByText(/already linked to another account/i, {}, { timeout: 3000 })).toBeTruthy();
    expect(goBack).not.toHaveBeenCalled();
  });
});
