import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

/** "x% off" chip; hidden when pct is 0. */
export function DiscountBadge({ pct }: { pct: number }) {
  if (!pct || pct <= 0) return null;
  return (
    <View style={styles.badge} testID="discount-badge">
      <Text style={styles.text} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
        {pct}% off
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xxs,
    alignSelf: 'flex-start',
  },
  text: { ...theme.typography.caption, color: theme.colors.brandStrong, fontWeight: '700' },
});
