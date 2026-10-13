import type { HeroContent } from '@belzo/shared';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Banner } from '@/api/types';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { RemoteImage } from '@/ui/RemoteImage';

const WIDTH = Dimensions.get('window').width - theme.spacing.lg * 2;

export interface HeroBannerProps {
  banners: Banner[];
  hero: HeroContent;
  onOpenHref: (href: string | null | undefined) => void;
}

/** Banner carousel when banners exist, otherwise the merged hero card (design §11 Home). */
export function HeroBanner({ banners, hero, onOpenHref }: HeroBannerProps) {
  if (banners.length > 0) {
    return (
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.carousel}
      >
        {banners.map((b) => (
          <Pressable
            key={b.id}
            onPress={() => onOpenHref(b.linkUrl)}
            accessibilityRole="button"
            accessibilityLabel={b.title ?? 'Promotion'}
            style={styles.slide}
          >
            <RemoteImage uri={b.imageUrl} width={WIDTH} height={160} radius={theme.radius.md} alt={b.title ?? undefined} />
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.hero}>
      <RemoteImage uri={hero.imageUrl || null} width="100%" height={160} radius={theme.radius.md} />
      <View style={styles.heroText}>
        {hero.eyebrow ? <Text style={styles.eyebrow}>{hero.eyebrow}</Text> : null}
        <Text style={styles.title}>
          {[hero.line1, hero.line2].filter(Boolean).join(' ')}{' '}
          <Text style={styles.accent}>{hero.accent}</Text>
        </Text>
        {hero.subtitle ? <Text style={styles.subtitle}>{hero.subtitle}</Text> : null}
        {hero.ctaText ? (
          <Button
            title={hero.ctaText}
            onPress={() => onOpenHref(hero.ctaHref)}
            style={styles.cta}
            testID="hero-cta"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: { marginHorizontal: theme.spacing.lg },
  slide: { marginRight: theme.spacing.sm },
  hero: {
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  heroText: { padding: theme.spacing.lg, gap: theme.spacing.xs },
  eyebrow: { ...theme.typography.caption, color: theme.colors.brandStrong, fontWeight: '700' },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong },
  accent: { color: theme.colors.brandStrong },
  subtitle: { ...theme.typography.body, color: theme.colors.muted },
  cta: { alignSelf: 'flex-start', marginTop: theme.spacing.sm },
});
