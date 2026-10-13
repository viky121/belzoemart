import { buildConfig } from '../app.config';

type Extra = {
  variant: string;
  apiBaseUrl: string;
  cleartextHosts: string[];
  showDevOtp: boolean;
  phoneOtpEnabled: boolean;
  onlinePaymentEnabled: boolean;
  eas?: { projectId: string };
};

const extraOf = (env: Record<string, string | undefined>) => buildConfig(env).extra as Extra;
const pluginNames = (env: Record<string, string | undefined>) =>
  (buildConfig(env).plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));

const PROD = { APP_VARIANT: 'production', EXPO_PUBLIC_API_BASE_URL: 'https://shop.example.com' };

describe('app.config buildConfig', () => {
  it('development defaults', () => {
    const cfg = buildConfig({});
    expect(cfg.name).toBe('Belzo eMart (Dev)');
    expect(cfg.scheme).toBe('belzoemart-dev');
    expect(cfg.android?.package).toBe('in.belzo.emart.dev');
    expect(cfg.android?.allowBackup).toBe(false);
    const extra = extraOf({});
    expect(extra.variant).toBe('development');
    expect(extra.apiBaseUrl).toBe('http://13.48.85.9');
    expect(extra.cleartextHosts).toEqual(['13.48.85.9', '10.0.2.2', 'localhost', '127.0.0.1']);
    expect(extra.showDevOtp).toBe(true);
    expect(extra.phoneOtpEnabled).toBe(true);
    expect(extra.eas).toBeUndefined();
    expect(pluginNames({})).toContain('./plugins/with-network-security-config');
  });

  it('online payment is off by default in development', () => {
    expect(extraOf({}).onlinePaymentEnabled).toBe(false);
  });

  it('online payment is off by default in production', () => {
    expect(extraOf(PROD).onlinePaymentEnabled).toBe(false);
  });

  it.each([{}, PROD])('EXPO_PUBLIC_ONLINE_PAYMENT=on enables online payment (%o)', (base) => {
    expect(extraOf({ ...base, EXPO_PUBLIC_ONLINE_PAYMENT: 'on' }).onlinePaymentEnabled).toBe(true);
  });

  it('production config', () => {
    const cfg = buildConfig(PROD);
    expect(cfg.name).toBe('Belzo eMart');
    expect(cfg.scheme).toBe('belzoemart');
    expect(cfg.android?.package).toBe('in.belzo.emart');
    const extra = extraOf(PROD);
    expect(extra.apiBaseUrl).toBe('https://shop.example.com');
    expect(extra.cleartextHosts).toEqual([]);
    expect(extra.showDevOtp).toBe(false);
    expect(extra.phoneOtpEnabled).toBe(false);
    expect(extraOf({ ...PROD, EXPO_PUBLIC_PHONE_OTP: 'on' }).phoneOtpEnabled).toBe(true);
  });

  it('production has no network-security plugin', () => {
    expect(pluginNames(PROD)).not.toContain('./plugins/with-network-security-config');
    expect(pluginNames(PROD)).toEqual([
      'expo-splash-screen',
      'expo-secure-store',
      'expo-image-picker',
    ]);
  });

  it('production requires https', () => {
    expect(() => buildConfig({ APP_VARIANT: 'production' })).toThrow(/https/);
    expect(() =>
      buildConfig({ APP_VARIANT: 'production', EXPO_PUBLIC_API_BASE_URL: 'http://13.48.85.9' }),
    ).toThrow(/https/);
    expect(() =>
      buildConfig({ APP_VARIANT: 'production', EXPO_PUBLIC_API_BASE_URL: 'not a url' }),
    ).toThrow();
  });

  it('trims and strips trailing slashes from the base URL', () => {
    expect(extraOf({ EXPO_PUBLIC_API_BASE_URL: ' http://10.0.2.2:4000/ ' }).apiBaseUrl).toBe(
      'http://10.0.2.2:4000',
    );
  });

  it('dev cleartext hosts: extra entries are appended and de-duplicated', () => {
    const extra = extraOf({ BELZO_DEV_CLEARTEXT_HOSTS: '192.168.1.20, dev-pc.local ,localhost' });
    expect(extra.cleartextHosts).toEqual([
      '13.48.85.9',
      '10.0.2.2',
      'localhost',
      '127.0.0.1',
      '192.168.1.20',
      'dev-pc.local',
    ]);
  });

  it.each(['http://192.168.1.20', '192.168.1.300', 'bad host', 'a/b', '*.example.com'])(
    'dev cleartext host validation rejects %s',
    (bad) => {
      expect(() => buildConfig({ BELZO_DEV_CLEARTEXT_HOSTS: bad })).toThrow(/hostname or IPv4/);
    },
  );

  it('network security plugin validates hosts and builds the XML', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plugin = require('../plugins/with-network-security-config') as {
      (config: object, props: { cleartextHosts: string[] }): object;
      isValidHost: (h: string) => boolean;
      buildXml: (hosts: string[]) => string;
    };
    expect(plugin.isValidHost('13.48.85.9')).toBe(true);
    expect(plugin.isValidHost('bad host')).toBe(false);
    expect(() => plugin({}, { cleartextHosts: ['ok.local', 'bad host'] })).toThrow(/bad host/);
    const xml = plugin.buildXml(['13.48.85.9', '10.0.2.2']);
    expect(xml).toContain('<base-config cleartextTrafficPermitted="false" />');
    expect(xml).toContain('<domain includeSubdomains="false">13.48.85.9</domain>');
    expect(xml).toContain('<domain includeSubdomains="false">10.0.2.2</domain>');
  });

  it('EAS_PROJECT_ID is passed through only when set', () => {
    expect(extraOf({ EAS_PROJECT_ID: 'abc' }).eas).toEqual({ projectId: 'abc' });
  });
});
