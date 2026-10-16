/* Global Jest mocks for native modules (design §16.1). */

// expo-secure-store: in-memory Map, shared across the module instance.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    isAvailableAsync: jest.fn(async () => true),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock('expo-crypto', () => {
  // Node's crypto (Jest runs on Node); typed locally because @types/node is not a mobile dep.
  const nodeCrypto = require('crypto') as {
    randomUUID: () => string;
    createHash: (alg: string) => {
      update: (d: string, enc: string) => { digest: (enc: string) => string };
    };
  };
  return {
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
    digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex'),
    ),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  };
});

jest.mock('expo-image', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return { Image: View };
});

jest.mock('react-native-svg', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: View,
    Svg: View,
    SvgXml: View,
    // Shapes used by Gradient and the festival diya glyph.
    Path: View,
    Rect: View,
    Defs: View,
    Stop: View,
    LinearGradient: View,
  };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants') as {
    default: Record<string, unknown>;
  } & Record<string, unknown>;
  return {
    ...actual,
    __esModule: true,
    default: {
      ...actual.default,
      expoConfig: {
        ...((actual.default.expoConfig as object | undefined) ?? {}),
        scheme: 'belzoemart-dev',
        extra: {
          variant: 'development',
          apiBaseUrl: 'http://api.test',
          cleartextHosts: ['api.test', '10.0.2.2', 'localhost', '127.0.0.1'],
          showDevOtp: true,
          phoneOtpEnabled: true,
          onlinePaymentEnabled: false,
        },
      },
    },
  };
});

// expo-linking needs a native manifest/host URI that Jest does not have.
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `belzoemart-dev://${path.replace(/^\//, '')}`),
  openURL: jest.fn(async () => true),
  openSettings: jest.fn(async () => undefined),
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

require('@shopify/flash-list/jestSetup');
