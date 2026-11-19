// Marks hardware features as optional so Google Play does not hide the app from phones that lack them.
//
// Without this, libraries that touch the camera / Wi-Fi / screen orientation can add a <uses-feature> that Play
// treats as REQUIRED, and the app would be filtered out of the store for some devices. The portrait lock in
// app.config.ts (orientation: 'portrait') also implies android.hardware.screen.portrait, so it is declared
// here as not required too.
//
// Rebuilt from the manifest of Play build versionCode 3 (the original plugin file was never committed): that
// build differs from the previous one by exactly these two lines and nothing else:
//   <uses-feature android:name="android.hardware.screen.portrait" android:required="false"/>
//   <uses-feature android:name="android.hardware.wifi" android:required="false"/>
//
// Uses `expo/config-plugins` because pnpm isolation does not expose @expo/config-plugins here.
const { withAndroidManifest } = require('expo/config-plugins');

/** The features declared as optional (android:required="false"). */
const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

function withOptionalHardwareFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest['uses-feature'] ??= []);
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((f) => f.$ && f.$['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    return cfg;
  });
}

module.exports = withOptionalHardwareFeatures;
module.exports.OPTIONAL_FEATURES = OPTIONAL_FEATURES;
