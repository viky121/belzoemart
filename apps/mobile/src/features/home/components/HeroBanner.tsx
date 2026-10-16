import type { HeroContent } from '@belzo/shared';
import { useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { Banner } from '@/api/types';
import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';

const WIDTH = Dimensions.get('window').width - theme.spacing.lg * 2;
const HEIGHT = 170;

export interface HeroBannerProps {
  banners: Banner[];
  hero: HeroContent;
  onOpenHref: (href: string | null | undefined) => void;
}

function Dots({ count, active }: { count: number; active: number }) {
  if (count <= 1) return null;
  return (
    <View style={styles.dots} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === active && styles.dotOn]} />
      ))}
    </View>
  );
}

/** Rounded banner carousel with page dots; falls back to a "Big Savings" promo card. */
export function HeroBanner({ banners, hero, onOpenHref }: HeroBannerProps) {
  const [page, setPage] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / WIDTH));

  if (banners.length > 0) {
    return (
      <View style={styles.wrap}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={styles.carousel}
        >
          {banners.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => onOpenHref(b.linkUrl)}
              accessibilityRole="button"
              accessibilityLabel={b.title ?? 'Promotion'}
            >
              <RemoteImage
                uri={b.imageUrl}
                width={WIDTH}
                height={HEIGHT}
                alt={b.title ?? undefined}
              />
            </Pressable>
          ))}
        </ScrollView>
        <Dots count={banners.length} active={page} />
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.wrap, styles.promo]}
      onPress={() => onOpenHref(hero.ctaHref)}
      accessibilityRole="button"
      accessibilityLabel="Big Savings on everyday essentials"
    >
      <View style={styles.promoText}>
        <Text style={styles.promoTitle}>Big Savings</Text>
        <Text style={styles.promoSub}>on Everyday Essentials</Text>
        <Text style={styles.promoOff}>
          Up to <Text style={styles.promoOffBig}>50% OFF</Text>
        </Text>
        <View style={styles.shopNow} testID="hero-cta">
          <Text style={styles.shopNowText}>{hero.ctaText || 'Shop Now'}</Text>
        </View>
      </View>
      {hero.imageUrl ? (
        <RemoteImage uri={hero.imageUrl} width={130} height={130} contentFit="contain" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface2,
  },
  carousel: { width: WIDTH, height: HEIGHT },
  dots: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  dotOn: { width: 16, backgroundColor: theme.colors.primaryStrong },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: HEIGHT,
    padding: theme.spacing.lg,
    backgroundColor: '#fde9cf',
  },
  promoText: { flex: 1, gap: 2 },
  promoTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: theme.colors.primaryDeep },
  promoSub: { ...theme.typography.body, color: theme.colors.primaryDeep, fontWeight: '600' },
  promoOff: { ...theme.typography.body, color: theme.colors.inkStrong, marginTop: 4 },
  promoOffBig: { fontSize: 18, fontWeight: '800', color: theme.colors.inkStrong },
  shopNow: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primaryStrong,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
  },
  shopNowText: { ...theme.typography.body, color: theme.colors.white, fontWeight: '700' },
});
