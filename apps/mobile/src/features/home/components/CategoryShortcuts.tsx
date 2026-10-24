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

const CIRCLE = 66;
/** White ring between the tinted circle and the card, so each tile reads as a small "coin". */
const RING = 3;

/**
 * Home category tiles: every visible top-level category in a 4-per-row grid of
 * circles on a white card. A new category added in admin simply wraps onto the next row.
 */
export function CategoryShortcuts({ tiles, onPressCategory }: CategoryShortcutsProps) {
  const brand = useBrand();
  if (tiles.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.grid}>
        {tiles.map((t, i) => {
          const tint = brand.tints[i % brand.tints.length];
          return (
            <Pressable
              key={t.id}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              onPress={() => onPressCategory(t.node)}
              accessibilityRole="button"
              accessibilityLabel={t.name}
            >
              <View style={[styles.ring, { borderColor: tint }]}>
                <View style={[styles.circle, { backgroundColor: tint }]}>
                  {t.iconUrl ? (
                    <RemoteImage
                      uri={t.iconUrl}
                      width={CIRCLE}
                      height={CIRCLE}
                      radius={CIRCLE / 2}
                      fallbackLabel={t.name}
                    />
                  ) : (
                    <MaterialCommunityIcons name={iconForCategory(t.name)} size={30} color={brand.primary} />
                  )}
                </View>
              </View>
              <Text style={styles.label} numberOfLines={2}>
                {t.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl + 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: 2,
    gap: 6,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  // Outer ring in a lighter tint, inner disc in the tint: a soft two-tone look without images.
  ring: {
    width: CIRCLE + RING * 2 + 2,
    height: CIRCLE + RING * 2 + 2,
    borderRadius: (CIRCLE + RING * 2 + 2) / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    color: theme.colors.inkStrong,
    fontWeight: '600',
    textAlign: 'center',
  },
});
