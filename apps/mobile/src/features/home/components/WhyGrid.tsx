import { TILE_IMAGE_ASPECT, tileImage, type WhyItem } from '@belzo/shared';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';
import { SectionHeader } from '@/ui/SectionHeader';

export interface WhyGridProps {
  items: WhyItem[];
}

/**
 * "Why shop with us" value props from merged home content (design §11 Home). A point with a
 * picture is just that picture (its title is the description for screen readers); one without is
 * a text row. Points carry no icon.
 */
export function WhyGrid({ items }: WhyGridProps) {
  const { width } = useWindowDimensions();
  if (items.length === 0) return null;
  const cell = width - theme.spacing.lg * 2;
  return (
    <View style={styles.wrap}>
      <SectionHeader title="Why shop with Belzo" />
      <View style={styles.list}>
        {items.map((w, i) => {
          const image = tileImage(w);
          if (image) {
            return (
              <View
                key={`${w.title}-${i}`}
                accessible
                accessibilityRole="image"
                accessibilityLabel={w.title}
                testID={`why-image-${i}`}
              >
                <RemoteImage uri={image} width="100%" height={Math.round(cell / TILE_IMAGE_ASPECT)} radius={theme.radius.md} />
              </View>
            );
          }
          return (
            <View key={`${w.title}-${i}`} style={styles.row} testID={`why-text-${i}`}>
              <View style={styles.flex}>
                <Text style={styles.title}>{w.title}</Text>
                {w.sub ? <Text style={styles.sub}>{w.sub}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: theme.spacing.md },
  list: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  flex: { flex: 1 },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  sub: { ...theme.typography.caption, color: theme.colors.muted },
});
