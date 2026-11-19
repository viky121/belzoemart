import { buildConfig } from '../app.config';

/** The manifest part the plugin edits, as `withAndroidManifest` hands it over. */
type Feature = { $: Record<string, string> };
type Manifest = { manifest: { 'uses-feature'?: Feature[] } };

// The plugin is a CommonJS module that wraps `withAndroidManifest`; here that wrapper just runs the callback on a
// fake manifest, so the real edit logic is what gets exercised.
jest.mock('expo/config-plugins', () => ({
  withAndroidManifest: (config: { __manifest: Manifest }, cb: (c: { modResults: Manifest }) => unknown) =>
    cb({ ...config, modResults: config.__manifest }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../plugins/with-optional-hardware-features') as ((c: unknown) => unknown) & {
  OPTIONAL_FEATURES: string[];
};

const run = (features?: Feature[]) => {
  const manifest: Manifest = { manifest: features ? { 'uses-feature': features } : {} };
  plugin({ __manifest: manifest });
  return manifest.manifest['uses-feature'] ?? [];
};

describe('with-optional-hardware-features', () => {
  it('declares exactly the two features Play build 3 had, both not required', () => {
    expect(plugin.OPTIONAL_FEATURES).toEqual(['android.hardware.screen.portrait', 'android.hardware.wifi']);
    expect(run()).toEqual([
      { $: { 'android:name': 'android.hardware.screen.portrait', 'android:required': 'false' } },
      { $: { 'android:name': 'android.hardware.wifi', 'android:required': 'false' } },
    ]);
  });

  it('turns a feature that another library marked required into optional, without duplicating it', () => {
    const out = run([{ $: { 'android:name': 'android.hardware.wifi', 'android:required': 'true' } }]);
    expect(out.filter((f) => f.$['android:name'] === 'android.hardware.wifi')).toHaveLength(1);
    expect(out.find((f) => f.$['android:name'] === 'android.hardware.wifi')?.$['android:required']).toBe('false');
  });

  it('keeps unrelated features untouched', () => {
    const camera: Feature = { $: { 'android:name': 'android.hardware.camera', 'android:required': 'false' } };
    expect(run([camera])).toContainEqual(camera);
  });
});

describe('app.config registers the plugin', () => {
  const names = (env: Record<string, string | undefined>) =>
    (buildConfig(env).plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
  it('in production and in development builds', () => {
    expect(names({ APP_VARIANT: 'production', EXPO_PUBLIC_API_BASE_URL: 'https://shop.example.com' })).toContain(
      './plugins/with-optional-hardware-features',
    );
    expect(names({})).toContain('./plugins/with-optional-hardware-features');
  });
});
