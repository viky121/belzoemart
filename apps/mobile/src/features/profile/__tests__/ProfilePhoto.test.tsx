import * as ImageManipulator from 'expo-image-manipulator';
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
  manipulateAsync: jest.fn(async () => ({ uri: 'file:///tmp/small.jpg', base64: 'QUJD'.repeat(40) })),
  SaveFormat: { JPEG: 'jpeg' },
}));

const PROFILE = { id: 'c1', name: 'Rajesh', email: null, phone: '8802307657', gender: null, dob: null, photoUrl: null, locale: 'en', status: 'active' };

function reply(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });
}
interface Call { url: string; method: string; body?: unknown }

function serve(handler: (c: Call) => Promise<unknown> | undefined) {
  const calls: Call[] = [];
  globalThis.fetch = jest.fn((url: string, init?: { method?: string; body?: unknown }) => {
    const call = { url: String(url), method: init?.method ?? 'GET', body: init?.body };
    calls.push(call);
    return handler(call) ?? reply(PROFILE);
  }) as unknown as typeof fetch;
  return calls;
}
const open = async () => renderWithProviders(<ProfilePhoto />, { navigation: false, queryClient: createTestQueryClient() });
const pickFromGallery = async (ui: Awaited<ReturnType<typeof open>>) =>
  fireEvent.press(ui.getByLabelText('Choose profile photo from gallery'));

describe('ProfilePhoto', () => {
  beforeEach(async () => {
    __testing.reset();
    await tokenManager.setSession({ accessToken: 'access-1', expiresIn: 900, refreshToken: 'refresh-1' });
    useSessionStore.setState({ status: 'authenticated', customer: { id: 'c1', name: 'Rajesh', email: null, phone: '8802307657', locale: 'en' } } as never);
    (ImageManipulator.manipulateAsync as jest.Mock).mockImplementation(async () => ({ uri: 'file:///tmp/small.jpg', base64: 'QUJD'.repeat(40) }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends the picture as text in a normal JSON request, saves its address on the profile and shows it', async () => {
    let photoUrl: string | null = null;
    const calls = serve((c) => {
      if (c.url.endsWith('/me/photo') && c.method === 'POST') return reply({ url: '/api/uploads/profile/abc.jpg', key: 'profile/abc.jpg' });
      if (c.url.endsWith('/me') && c.method === 'PATCH') {
        photoUrl = JSON.parse(String(c.body)).photoUrl;
        return reply({ ...PROFILE, photoUrl });
      }
      return reply({ ...PROFILE, photoUrl });
    });
    const ui = await open();
    await pickFromGallery(ui);

    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true), { timeout: 3000 });
    const upload = calls.find((c) => c.url.endsWith('/me/photo') && c.method === 'POST')!;
    expect(JSON.parse(String(upload.body))).toEqual({ image: 'QUJD'.repeat(40), mimeType: 'image/jpeg' });
    expect(typeof upload.body).toBe('string'); // plain JSON, not a multipart file
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(JSON.parse(String(patch.body))).toEqual({ photoUrl: '/api/uploads/profile/abc.jpg' });
    expect(calls.indexOf(upload)).toBeLessThan(calls.indexOf(patch));
    await waitFor(() => expect(ui.getByLabelText('Profile photo')).toBeTruthy(), { timeout: 3000 });
  });

  it('shrinks the picture again when the first size is too big for one request', async () => {
    const widths: number[] = [];
    (ImageManipulator.manipulateAsync as jest.Mock).mockImplementation(async (_u: string, actions: { resize: { width: number } }[]) => {
      widths.push(actions[0]!.resize.width);
      return { uri: 'file:///tmp/small.jpg', base64: 'A'.repeat(widths.length < 3 ? 950_000 : 5_000) };
    });
    const calls = serve((c) => (c.url.endsWith('/me/photo') ? reply({ url: '/api/uploads/profile/z.jpg', key: 'k' }) : undefined));
    const ui = await open();
    await pickFromGallery(ui);
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true), { timeout: 3000 });
    expect(widths).toEqual([600, 400, 256]);
  });

  it('falls back to the file upload route when the server does not have the JSON route yet', async () => {
    const calls = serve((c) => {
      if (c.url.endsWith('/me/photo') && c.method === 'POST') return reply({ statusCode: 404, error: 'NotFoundException', message: 'Cannot POST /api/v1/me/photo' }, 404);
      if (c.url.endsWith('/me/photo/upload')) return reply({ url: '/api/uploads/profile/old.jpg', key: 'k' });
      return undefined;
    });
    const ui = await open();
    await pickFromGallery(ui);
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true), { timeout: 3000 });
    expect(calls.map((c) => c.url.replace(/^.*\/api\/v1/, ''))).toEqual(expect.arrayContaining(['/me/photo', '/me/photo/upload']));
  });

  it('says why when the server refuses the picture', async () => {
    serve((c) => (c.url.endsWith('/me/photo') ? reply({ statusCode: 400, error: 'BadRequestException', message: 'The picture is too large. Please choose a smaller one.' }, 400) : undefined));
    const ui = await open();
    await pickFromGallery(ui);
    expect(await ui.findByText(/picture is too large/i, {}, { timeout: 3000 })).toBeTruthy();
  });

  it('a bug in our own picture code is NOT reported as "you are offline"; it names the step', async () => {
    (ImageManipulator.manipulateAsync as jest.Mock).mockImplementation(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'width')");
    });
    serve(() => undefined);
    const ui = await open();
    await pickFromGallery(ui);
    expect(await ui.findByText(/Could not read that picture/i, {}, { timeout: 3000 })).toBeTruthy();
    expect(ui.queryByText(/offline/i)).toBeNull();
  });

  it('a real network failure while sending is reported as a connection problem', async () => {
    globalThis.fetch = jest.fn((url: string, init?: { method?: string }) => {
      if (String(url).endsWith('/me/photo') && init?.method === 'POST') return Promise.reject(new TypeError('Network request failed'));
      return reply(PROFILE);
    }) as unknown as typeof fetch;
    const ui = await open();
    await pickFromGallery(ui);
    expect(await ui.findByText(/offline|connection/i, {}, { timeout: 3000 })).toBeTruthy();
  });
});
