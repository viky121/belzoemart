import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { IconButton } from '@/ui/IconButton';

import { useAppUpdate } from './hooks';

/** "New version available" strip with a Download button; hidden until a newer APK is published. */
export function UpdateBanner() {
  const update = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  if (!update.updateAvailable || dismissed) return null;
  return (
    <View style={styles.wrap} testID="update-banner">
      <MaterialCommunityIcons name="cellphone-arrow-down" size={22} color={theme.colors.primaryStrong} />
      <View style={styles.text}>
        <Text style={styles.title}>New version {update.latest} available</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {update.notes ?? 'Download the latest Belzo app for new features and fixes.'}
        </Text>
      </View>
      <Pressable
        onPress={update.download}
        accessibilityRole="button"
        accessibilityLabel={`Download Belzo app version ${update.latest}`}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        testID="update-download"
      >
        <Text style={styles.btnText}>Download</Text>
      </Pressable>
      <IconButton icon="close" label="Dismiss update notice" size={18} onPress={() => setDismissed(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.primaryBg,
    borderRadius: theme.radius.lg,
  },
  text: { flex: 1, paddingVertical: theme.spacing.xs },
  title: { ...theme.typography.body, fontWeight: '800', color: theme.colors.inkStrong },
  sub: { ...theme.typography.caption, color: theme.colors.muted },
  btn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryStrong,
  },
  pressed: { opacity: 0.85 },
  btnText: { ...theme.typography.body, fontWeight: '800', color: theme.colors.white },
});
