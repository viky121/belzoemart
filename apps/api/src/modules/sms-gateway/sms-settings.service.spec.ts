import { SmsCredentials } from '../../integrations/sms/sms-credentials';
import type { SmsMessage, SmsProvider } from '../../integrations/sms/sms.provider';
import { decryptSecret } from '../../integrations/payment/secret-box';
import type { SettingsService } from '../admin/settings.service';
import { maskKey, SMS_CREDENTIALS_KEY, SmsSettingsService } from './sms-settings.service';

const SERVER = 'a-server-side-secret-that-is-long-enough!!';
const ENV_KEY = 'E'.repeat(40) + 'ENVK';
const NEW_KEY = 'N'.repeat(40) + 'NEWK';

function make(initial: Record<string, unknown> = {}, sms?: SmsProvider) {
  const store: Record<string, unknown> = { ...initial };
  const set = jest.fn(async (_actor: string, key: string, value: unknown) => {
    store[key] = value;
  });
  const settings = { get: jest.fn(async (key: string) => store[key] ?? null), set } as unknown as SettingsService;
  const creds = new SmsCredentials();
  const provider = sms ?? { send: async () => ({ messageId: 'x' }) };
  return { svc: new SmsSettingsService(settings, creds, provider), creds, store, set };
}

function fast2sms(status: number, body: unknown) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('SmsSettingsService', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = SERVER;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    process.env.SMS_PROVIDER = 'live';
    process.env.FAST2SMS_API_KEY = ENV_KEY;
    process.env.FAST2SMS_ROUTE = 'otp';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  it('masks the key to its last 4 characters', () => {
    expect(maskKey('abcdefghijkl')).toBe('••••••••ijkl');
    expect(maskKey('')).toBe('');
  });

  it('starts from the server environment and never exposes the key in status', () => {
    const { svc } = make();
    const s = svc.status();
    expect(s).toMatchObject({ mode: 'live', route: 'otp', keyConfigured: true, keyHint: '••••••••ENVK' });
    expect(s.source.apiKey).toBe('env');
    expect(JSON.stringify(s)).not.toContain(ENV_KEY);
  });

  it('verifies a new key with the free wallet lookup, stores it encrypted, and starts using it', async () => {
    const spy = fast2sms(200, { return: true, wallet: '50.0000', sms_count: 200 });
    const { svc, creds, store } = make();
    await svc.save('admin-1', { apiKey: NEW_KEY });
    expect(spy).toHaveBeenCalledWith(
      'https://www.fast2sms.com/dev/wallet',
      expect.objectContaining({ headers: { authorization: NEW_KEY } }),
    );
    const row = store[SMS_CREDENTIALS_KEY] as { apiKeyEnc: string };
    expect(JSON.stringify(row)).not.toContain(NEW_KEY);
    expect(decryptSecret(row.apiKeyEnc, SERVER)).toBe(NEW_KEY);
    expect(creds.get().apiKey).toBe(NEW_KEY);
    const s = svc.status();
    expect(s.source.apiKey).toBe('admin');
    expect(JSON.stringify(s)).not.toContain(NEW_KEY);
  });

  it('refuses a key Fast2SMS rejects and keeps the working one', async () => {
    fast2sms(200, { return: false, status_code: 412, message: 'Invalid Authentication' });
    const { svc, creds, set } = make();
    await expect(svc.save('admin-1', { apiKey: NEW_KEY })).rejects.toThrow(/rejected this API key/);
    expect(set).not.toHaveBeenCalled();
    expect(creds.get().apiKey).toBe(ENV_KEY);
  });

  it('does not save when Fast2SMS cannot be reached', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));
    const { svc, set } = make();
    await expect(svc.save('admin-1', { apiKey: NEW_KEY })).rejects.toThrow(/Could not reach Fast2SMS/);
    expect(set).not.toHaveBeenCalled();
  });

  it('validates the fields and requires sender + message id for the DLT route', async () => {
    const { svc } = make();
    await expect(svc.save('a', {})).rejects.toThrow(/Nothing to save/);
    await expect(svc.save('a', { apiKey: 'short' })).rejects.toThrow(/does not look like/);
    await expect(svc.save('a', { senderId: 'TOOLONGID' })).rejects.toThrow(/3 to 6 letters/);
    await expect(svc.save('a', { route: 'dlt' })).rejects.toThrow(/needs both a Sender ID and a Message ID/);
    await svc.save('a', { route: 'dlt', senderId: 'BELZOE', dltMessageId: '178001' });
    expect(svc.status()).toMatchObject({ route: 'dlt', senderId: 'BELZOE', dltMessageId: '178001' });
  });

  it('Smart OTP route needs an OTP id and is saved with it', async () => {
    const { svc, creds } = make();
    await expect(svc.save('a', { route: 'smart' })).rejects.toThrow(/needs an OTP ID/);
    await expect(svc.save('a', { otpId: 'bad id!' })).rejects.toThrow(/OTP ID is the id/);
    await svc.save('a', { route: 'smart', otpId: '11111111' });
    expect(svc.status()).toMatchObject({ route: 'smart', otpId: '11111111' });
    expect(svc.status().source.otpId).toBe('admin');
    expect(creds.get().otpId).toBe('11111111');
  });

  it('reset returns to the server environment', async () => {
    fast2sms(200, { return: true, wallet: '1', sms_count: 1 });
    const { svc, creds } = make();
    await svc.save('a', { apiKey: NEW_KEY });
    await svc.reset('a');
    expect(creds.get().apiKey).toBe(ENV_KEY);
    expect(svc.status().source.apiKey).toBe('env');
  });

  it('falls back to the environment and flags it when the stored key cannot be decrypted', async () => {
    const { svc, creds } = make({ [SMS_CREDENTIALS_KEY]: { apiKeyEnc: 'v1.bad.bad.bad' } });
    await svc.load();
    expect(creds.get().apiKey).toBe(ENV_KEY);
    expect(svc.status().overrideUnreadable).toBe(true);
  });

  it('testCurrent reports the wallet', async () => {
    fast2sms(200, { return: true, wallet: '50.0000', sms_count: 200 });
    const r = await make().svc.testCurrent();
    expect(r).toMatchObject({ ok: true, wallet: { balance: 50, smsCount: 200 } });
  });

  it('sendTest sends one OTP-style SMS and masks the number; refuses in mock mode', async () => {
    const sent: SmsMessage[] = [];
    const { svc } = make({}, { send: async (m) => (sent.push(m), { messageId: 'x' }) });
    const ok = await svc.sendTest('+91 98765 43210');
    expect(ok.ok).toBe(true);
    expect(ok.message).not.toContain('9876543210');
    expect(sent[0]).toMatchObject({ to: '9876543210' });
    expect(sent[0].otp).toMatch(/^\d{6}$/);
    process.env.SMS_PROVIDER = 'mock';
    expect((await svc.sendTest('9876543210')).ok).toBe(false);
    expect(sent).toHaveLength(1);
  });
});
