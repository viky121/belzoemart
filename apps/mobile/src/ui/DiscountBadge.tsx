import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

/** "X% OFF" green discount text (mockup style); hidden when pct is 0. */
export function DiscountBadge({ pct }: { pct: number }) {
  if (!pct || pct <= 0) return null;
  return (
    <View style={styles.badge} testID="discount-badge">
      <Text style={styles.text} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
        {pct}% OFF
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
  },
  text: { ...theme.typography.caption, color: theme.colors.brandStrong, fontWeight: '700' },
});
