import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

/** Shown when NetInfo reports the device offline. */
export function OfflineBanner() {
  const net = useNetInfo();
  if (net.isConnected !== false) return null;
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={styles.text}>You're offline. Some content may be out of date.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colors.navy,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  text: { ...theme.typography.caption, color: theme.colors.white, textAlign: 'center' },
});
