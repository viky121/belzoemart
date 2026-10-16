import type { CategoryNodeDto } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { iconForCategory } from '@/lib/category-icon';
import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';

export interface CategoryShortcutsProps {
  categories: CategoryNodeDto[];
  onPressCategory: (node: CategoryNodeDto) => void;
}

const PASTELS = [
  '#e4f3ec',
  '#fdeee4',
  '#e7f0ff',
  '#f3e8ff',
  '#e2f7ff',
  '#fff2d9',
  '#ffe3ec',
  '#e9fbf3',
] as const;

/**
 * Home category tiles: every top-level category in a 4-per-row grid of circular
 * pastel icons. New categories added in admin simply wrap onto the next row.
 */
export function CategoryShortcuts({ categories, onPressCategory }: CategoryShortcutsProps) {
  if (categories.length === 0) return null;
  return (
    <View style={styles.grid}>
      {categories.map((c, i) => (
        <Pressable
          key={c.id}
          style={styles.tile}
          onPress={() => onPressCategory(c)}
          accessibilityRole="button"
          accessibilityLabel={c.name}
        >
          <View style={[styles.circle, { backgroundColor: PASTELS[i % PASTELS.length] }]}>
            {c.imageUrl ? (
              <RemoteImage uri={c.imageUrl} width={48} height={48} radius={24} fallbackLabel={c.name} />
            ) : (
              <MaterialCommunityIcons
                name={iconForCategory(c.name)}
                size={30}
                color={theme.colors.primaryStrong}
              />
            )}
          </View>
          <Text style={styles.label} numberOfLines={2}>
            {c.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  tile: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: 2,
    gap: theme.spacing.xs,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...theme.typography.caption,
    fontSize: 12,
    color: theme.colors.inkStrong,
    fontWeight: '600',
    textAlign: 'center',
  },
});
