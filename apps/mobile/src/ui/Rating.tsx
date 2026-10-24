import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export interface RatingProps {
  value: number;
  count?: number;
}

/** Compact "★ 4.3 (120)" rating; hidden when there are no ratings. */
export function Rating({ value, count }: RatingProps) {
  if (!value || (count !== undefined && count <= 0)) return null;
  const v = Math.round(value * 10) / 10;
  const label =
    count !== undefined ? `Rated ${v} out of 5 by ${count} customers` : `Rated ${v} out of 5`;
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <MaterialCommunityIcons name="star" size={14} color={theme.colors.yellow} />
      <Text style={styles.value} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
        {v.toFixed(1)}
      </Text>
      {count !== undefined ? (
        <Text style={styles.count} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
          ({count})
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs },
  value: { ...theme.typography.caption, color: theme.colors.ink, fontWeight: '700' },
  count: { ...theme.typography.caption, color: theme.colors.muted },
});
