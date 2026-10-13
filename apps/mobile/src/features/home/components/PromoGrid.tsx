import type { PromoContent } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

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

/** Promo tiles from merged home content (design §11 Home). */
export function PromoGrid({ promos, onOpenHref }: PromoGridProps) {
  if (promos.length === 0) return null;
  return (
    <View style={styles.grid}>
      {promos.map((p, i) => (
        <Pressable
          key={`${p.title}-${i}`}
          onPress={() => onOpenHref(p.href)}
          accessibilityRole="button"
          accessibilityLabel={`${p.title}. ${p.subtitle}`}
          style={[styles.tile, { backgroundColor: COLOR_BG[p.color] }]}
        >
          <Text style={styles.icon}>{p.icon}</Text>
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
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
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
  icon: { fontSize: 26 },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  subtitle: { ...theme.typography.caption, color: theme.colors.muted },
  cta: { ...theme.typography.caption, color: theme.colors.primaryStrong, fontWeight: '700', marginTop: theme.spacing.xs },
});
