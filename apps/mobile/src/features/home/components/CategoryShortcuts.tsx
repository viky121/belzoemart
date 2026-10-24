import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
/**
 * How many tiles fit across the card. The half tile is deliberate: the next category peeks in from the right,
 * so people can see the row slides.
 */
export const VISIBLE_TILES = 4.5;
/** Narrowest a tile may get on a very small screen. */
const MIN_TILE = 68;

/** Width of one tile for a screen of this width (card margins and padding taken off). */
export function tileWidthFor(screenWidth: number, horizontalChrome: number): number {
  return Math.max(MIN_TILE, Math.floor((screenWidth - horizontalChrome) / VISIBLE_TILES));
}
/** White ring between the tinted circle and the card, so each tile reads as a small "coin". */
const RING = 3;

/**
 * Home category tiles: every visible top-level category as a circle in ONE row that slides sideways. A new
 * category added in admin joins the end of the row (or its place in the admin order); it never starts a new
 * row below.
 */
export function CategoryShortcuts({ tiles, onPressCategory }: CategoryShortcutsProps) {
  const brand = useBrand();
  const { width } = useWindowDimensions();
  if (tiles.length === 0) return null;
  const tileWidth = tileWidthFor(width, theme.spacing.md * 2 + theme.spacing.xs * 2);
  return (
    <View style={styles.card}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        testID="category-slider"
        accessibilityLabel="Categories. Swipe sideways for more."
      >
        {tiles.map((t, i) => {
          const tint = brand.tints[i % brand.tints.length];
          return (
            <Pressable
              key={t.id}
              style={({ pressed }) => [styles.tile, { width: tileWidth }, pressed && styles.pressed]}
              testID={`category-tile-${t.id}`}
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
      </ScrollView>
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
  row: { flexDirection: 'row' },
  tile: {
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
