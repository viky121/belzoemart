import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Smallest gap kept above the Android system navigation bar when the OS reports no inset. */
const ANDROID_MIN_BOTTOM = 32;
const DEFAULT_MIN_BOTTOM = 8;

/**
 * Space to leave at the bottom of the screen for the system navigation bar / home indicator.
 * Edge-to-edge draws the app under Android's back/home/recents buttons; some devices report a
 * 0 inset for them, so Android always keeps a minimum so bottom bars never sit under the buttons.
 */
export function useBottomInset(): number {
  const { bottom } = useSafeAreaInsets();
  return Math.max(bottom, Platform.OS === 'android' ? ANDROID_MIN_BOTTOM : DEFAULT_MIN_BOTTOM);
}

/** The safe-area insets with the bottom one made safe for Android (see useBottomInset). */
export function useInsets() {
  const insets = useSafeAreaInsets();
  const bottom = useBottomInset();
  return { ...insets, bottom };
}
