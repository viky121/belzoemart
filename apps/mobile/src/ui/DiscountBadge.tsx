import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export interface DiscountBadgeProps {
  pct: number;
  /** `inline` = soft green chip next to a price; `corner` = solid ribbon pinned to an image corner. */
  variant?: 'inline' | 'corner';
}

/** "X% OFF" badge; hidden when pct is 0. */
export function DiscountBadge({ pct, variant = 'inline' }: DiscountBadgeProps) {
  if (!pct || pct <= 0) return null;
  const corner = variant === 'corner';
  return (
    <View style={corner ? styles.corner : styles.badge} testID="discount-badge">
      <Text
        style={corner ? styles.cornerText : styles.text}
        maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
      >
        {pct}% OFF
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    ...theme.typography.caption,
    fontSize: 11,
    lineHeight: 14,
    color: theme.colors.brandStrong,
    fontWeight: '800',
  },
  corner: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: theme.colors.brandStrong,
    borderTopLeftRadius: theme.radius.md,
    borderBottomRightRadius: theme.radius.md,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  cornerText: {
    fontSize: 10.5,
    lineHeight: 13,
    color: theme.colors.white,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
