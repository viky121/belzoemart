import { promoImage, type PromoContent } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';

export interface PromoGridProps {
  promos: PromoContent[];
  onOpenHref: (href: string | null | undefined) => void;
}

const COLOR_BG: Record<PromoContent['color'], string> = {
  green: '#e7f7ee',
  blue: '#e6f0ff',
  amber: '#fff4e0',
  pink: '#fdeaf3',
};

/** Width / height of a picture tile (the website uses the same 16:7). */
const IMAGE_ASPECT = 16 / 7;
const GAP = theme.spacing.sm;

/**
 * Promo tiles from merged home content (design §11 Home). A tile with a picture is just that
 * picture (its title is the description for screen readers); other tiles are coloured text
 * tiles. Tiles carry no icon.
 */
export function PromoGrid({ promos, onOpenHref }: PromoGridProps) {
  const { width } = useWindowDimensions();
  if (promos.length === 0) return null;
  // Two tiles per line, like the text tiles (flexBasis 47%).
  const cell = Math.floor((width - theme.spacing.lg * 2 - GAP) / 2);
  return (
    <View style={styles.grid}>
      {promos.map((p, i) => {
        const image = promoImage(p);
        if (image) {
          return (
            <Pressable
              key={`${p.title}-${i}`}
              onPress={() => onOpenHref(p.href)}
              accessibilityRole="button"
              accessibilityLabel={p.title}
              style={styles.imageTile}
              testID={`promo-image-${i}`}
            >
              <RemoteImage
                uri={image}
                width="100%"
                height={Math.round(cell / IMAGE_ASPECT)}
                radius={theme.radius.md}
              />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={`${p.title}-${i}`}
            onPress={() => onOpenHref(p.href)}
            accessibilityRole="button"
            accessibilityLabel={`${p.title}. ${p.subtitle}`}
            style={[styles.tile, { backgroundColor: COLOR_BG[p.color] }]}
            testID={`promo-text-${i}`}
          >
            <Text style={styles.title} numberOfLines={2}>
              {p.title}
            </Text>
            {p.subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {p.subtitle}
              </Text>
            ) : null}
            <Text style={styles.cta}>{p.cta} →</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 2,
  },
  imageTile: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  subtitle: { ...theme.typography.caption, color: theme.colors.muted },
  cta: { ...theme.typography.caption, color: theme.colors.primaryStrong, fontWeight: '700', marginTop: theme.spacing.xs },
});
