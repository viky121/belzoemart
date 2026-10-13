import { statusBadge, type Tone } from '@belzo/shared';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

/** Tone → colours (design §3.4). */
export const TONE_COLORS: Record<Tone, { fg: string; bg: string }> = {
  ok: { fg: theme.colors.brandStrong, bg: theme.colors.successBg },
  info: { fg: theme.colors.primaryStrong, bg: theme.colors.surface2 },
  warn: { fg: theme.colors.warnText, bg: theme.colors.warnBg },
  bad: { fg: theme.colors.danger, bg: theme.colors.dangerBg },
  muted: { fg: theme.colors.muted, bg: theme.colors.surface2 },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const { label, tone } = statusBadge(status);
  const c = TONE_COLORS[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: c.bg }]}
      accessible
      accessibilityLabel={`Order status: ${label}`}
      testID={`order-status-${tone}`}
    >
      <Text
        style={[styles.text, { color: c.fg }]}
        maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xxs,
  },
  text: { ...theme.typography.caption, fontWeight: '700' },
});
