import { fireEvent, waitFor } from '@testing-library/react-native';
import { __testing, tokenManager } from '@/api/token-manager';
import { useSessionStore } from '@/store/session';
import { createTestQueryClient, renderWithProviders } from '@/test-utils';
import { ProfilePhoto } from '../components/ProfilePhoto';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///tmp/pick.jpg' }] })),
  launchCameraAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///tmp/cam.jpg' }] })),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(async () => ({ uri: 'file:///tmp/small.jpg' })),
  SaveFormat: { JPEG: 'jpeg' },
}));

const PROFILE = { id: 'c1', name: 'Rajesh', email: null, phone: '8802307657', gender: null, dob: null, photoUrl: null, locale: 'en', status: 'active' };

function reply(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });
}

describe('ProfilePhoto', () => {
  beforeEach(async () => {
    __testing.reset();
    await tokenManager.setSession({ accessToken: 'access-1', expiresIn: 900, refreshToken: 'refresh-1' });
    useSessionStore.setState({ status: 'authenticated', customer: { id: 'c1', name: 'Rajesh', email: null, phone: '8802307657', locale: 'en' } } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('uploads the picked photo, saves its address on the profile and shows it', async () => {
    let photoUrl: string | null = null;
    const calls: { url: string; method: string; body?: unknown }[] = [];
    globalThis.fetch = jest.fn((url: string, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(url), method, body: init?.body });
      if (String(url).endsWith('/me/photo/upload')) return reply({ url: '/api/uploads/profile/abc.jpg', key: 'profile/abc.jpg' });
      if (String(url).endsWith('/me') && method === 'PATCH') {
        photoUrl = JSON.parse(String(init?.body)).photoUrl;
        return reply({ ...PROFILE, photoUrl });
      }
      return reply({ ...PROFILE, photoUrl });
    }) as unknown as typeof fetch;

    const ui = await renderWithProviders(<ProfilePhoto />, { navigation: false, queryClient: createTestQueryClient() });
    await fireEvent.press(ui.getByLabelText('Choose profile photo from gallery'));

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true), { timeout: 3000 });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(JSON.parse(String(patch.body))).toEqual({ photoUrl: '/api/uploads/profile/abc.jpg' });
    expect(calls.findIndex((c) => c.url.endsWith('/me/photo/upload'))).toBeLessThan(calls.indexOf(patch));
    await waitFor(() => expect(ui.getByLabelText('Profile photo')).toBeTruthy(), { timeout: 3000 });
  });

  it('says why when the server refuses the photo', async () => {
    globalThis.fetch = jest.fn((url: string) =>
      String(url).endsWith('/me/photo/upload')
        ? reply({ statusCode: 400, error: 'BadRequestException', message: 'File too large (max 15 MB)' }, 400)
        : reply(PROFILE),
    ) as unknown as typeof fetch;
    const ui = await renderWithProviders(<ProfilePhoto />, { navigation: false, queryClient: createTestQueryClient() });
    await fireEvent.press(ui.getByLabelText('Choose profile photo from gallery'));
    await waitFor(() => expect(ui.getByText(/too large|Could not update the photo|try again/i)).toBeTruthy(), { timeout: 3000 });
  });
});
