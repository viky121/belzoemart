import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { iconForCategory } from '@/lib/category-icon';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { RemoteImage } from '@/ui/RemoteImage';

export interface CategoryShortcutsProps {
  /** Categories in display order, with admin label/icon overrides applied. */
  tiles: MobileCategoryTile[];
  onPressCategory: (node: CategoryNodeDto) => void;
}

/**
 * Home category tiles: every visible top-level category in a 4-per-row grid of
 * circles. A new category added in admin simply wraps onto the next row.
 */
export function CategoryShortcuts({ tiles, onPressCategory }: CategoryShortcutsProps) {
  const brand = useBrand();
  if (tiles.length === 0) return null;
  return (
    <View style={styles.grid}>
      {tiles.map((t, i) => (
        <Pressable
          key={t.id}
          style={styles.tile}
          onPress={() => onPressCategory(t.node)}
          accessibilityRole="button"
          accessibilityLabel={t.name}
        >
          <View style={[styles.circle, { backgroundColor: brand.tints[i % brand.tints.length] }]}>
            {t.iconUrl ? (
              <RemoteImage uri={t.iconUrl} width={64} height={64} radius={32} fallbackLabel={t.name} />
            ) : (
              <MaterialCommunityIcons
                name={iconForCategory(t.name)}
                size={30}
                color={brand.primary}
              />
            )}
          </View>
          <Text style={styles.label} numberOfLines={2}>
            {t.name}
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
    overflow: 'hidden',
  },
  label: {
    ...theme.typography.caption,
    fontSize: 12,
    color: theme.colors.inkStrong,
    fontWeight: '600',
    textAlign: 'center',
  },
});
