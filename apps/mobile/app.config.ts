import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Belzo eMart app config (design §13.1).
 *
 * Two variants: `development` (package `.dev`, cleartext only to listed hosts) and
 * `production` (https base URL enforced here, so an http production build cannot exist).
 * `buildConfig` is exported for unit tests; the default export reads `process.env`.
 */
export type Variant = 'development' | 'production';

export type BuildEnv = Record<string, string | undefined>;

const DEV_DEFAULT_API = 'http://13.48.85.9';
const DEV_CLEARTEXT_DEFAULTS = ['13.48.85.9', '10.0.2.2', 'localhost', '127.0.0.1'];

// Hostname (RFC 1123 labels) or dotted IPv4. Same rule as plugins/with-network-security-config.js.
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export function isValidCleartextHost(host: string): boolean {
  if (/^[\d.]+$/.test(host)) return IPV4_RE.test(host);
  return HOSTNAME_RE.test(host);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function resolveApiBaseUrl(raw: string, isProd: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `EXPO_PUBLIC_API_BASE_URL must be an absolute URL (got "${raw}")` +
        (isProd ? '; production requires an https:// URL.' : '.'),
    );
  }
  if (isProd && parsed.protocol !== 'https:') {
    throw new Error(
      `Production builds require an https:// EXPO_PUBLIC_API_BASE_URL (got "${raw}").`,
    );
  }
  if (!isProd && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL must use http:// or https:// (got "${raw}").`);
  }
  return raw;
}

export function buildConfig(env: BuildEnv): ExpoConfig {
  const variant: Variant = env.APP_VARIANT === 'production' ? 'production' : 'development';
  const isProd = variant === 'production';
  const apiBaseUrl = resolveApiBaseUrl(
    (env.EXPO_PUBLIC_API_BASE_URL ?? (isProd ? '' : DEV_DEFAULT_API)).trim().replace(/\/+$/, ''),
    isProd,
  );
  const cleartextHosts = isProd
    ? []
    : uniq([
        ...DEV_CLEARTEXT_DEFAULTS,
        ...(env.BELZO_DEV_CLEARTEXT_HOSTS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ]);
  const badHost = cleartextHosts.find((h) => !isValidCleartextHost(h));
  if (badHost !== undefined) {
    throw new Error(
      `BELZO_DEV_CLEARTEXT_HOSTS entries must be a hostname or IPv4 address (got "${badHost}").`,
    );
  }

  return {
    name: isProd ? 'Belzo eMart' : 'Belzo eMart (Dev)',
    slug: 'belzo-emart',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: isProd ? 'belzoemart' : 'belzoemart-dev',
    userInterfaceStyle: 'light',
    // Over-the-air (EAS Update): JS/UI changes reach installed builds without a
    // reinstall, as long as the native runtime is unchanged.
    runtimeVersion: { policy: 'appVersion' },
    ...(env.EAS_PROJECT_ID
      ? { updates: { url: `https://u.expo.dev/${env.EAS_PROJECT_ID}` } }
      : {}),
    icon: './assets/brand/icon.png',
    android: {
      package: isProd ? 'in.belzo.emart' : 'in.belzo.emart.dev',
      adaptiveIcon: {
        foregroundImage: './assets/brand/adaptive-foreground.png',
        backgroundColor: '#ffffff',
      },
      allowBackup: false,
      blockedPermissions: ['android.permission.RECORD_AUDIO'],
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          image: './assets/brand/splash-icon.png',
          imageWidth: 200,
          backgroundColor: '#ffffff',
        },
      ],
      ['expo-secure-store', { configureAndroidBackup: true }],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Belzo eMart to use your photos for return requests.',
          cameraPermission: 'Allow Belzo eMart to use the camera for return photos.',
          microphonePermission: false,
        },
      ],
      ...(isProd
        ? []
        : [['./plugins/with-network-security-config', { cleartextHosts }] as [string, unknown]]),
    ],
    extra: {
      variant,
      apiBaseUrl,
      cleartextHosts,
      showDevOtp: !isProd,
      phoneOtpEnabled: !isProd || env.EXPO_PUBLIC_PHONE_OTP === 'on',
      // Off by default in every variant: dev/preview builds talk to the LIVE store.
      onlinePaymentEnabled: env.EXPO_PUBLIC_ONLINE_PAYMENT === 'on',
      ...(env.EAS_PROJECT_ID ? { eas: { projectId: env.EAS_PROJECT_ID } } : {}),
    },
  };
}

export default (_ctx: ConfigContext): ExpoConfig => buildConfig(process.env);
