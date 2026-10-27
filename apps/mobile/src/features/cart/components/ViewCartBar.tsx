import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';

import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';

import { useCart } from '../hooks';

export interface ViewCartBarProps {
  /** Distance from the bottom of the parent: '100%' sits right above a tab bar. */
  bottom: DimensionValue;
}

const THUMB = 34;

/** Floating "View cart · N items" pill shown over listing screens while the cart has items. */
export function ViewCartBar({ bottom }: ViewCartBarProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data } = useCart();

  const active = useMemo(() => (data?.items ?? []).filter((l) => !l.savedForLater), [data]);
  const units = active.reduce((n, l) => n + l.quantity, 0);
  if (units === 0) return null;

  const thumbs = active.slice(0, 3);
  const label = `View cart, ${units} ${units === 1 ? 'item' : 'items'}`;

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        onPress={() => navigation.navigate('Cart')}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
        testID="view-cart-bar"
      >
        <View style={[styles.thumbs, { width: THUMB + (thumbs.length - 1) * 22 }]}>
          {thumbs.map((l, i) => (
            <View key={l.id} style={[styles.thumb, { left: i * 22, zIndex: thumbs.length - i }]}>
              <RemoteImage
                uri={l.imageUrl}
                width={THUMB - 4}
                height={THUMB - 4}
                radius={(THUMB - 4) / 2}
                contentFit="cover"
                fallbackLabel={l.title}
              />
            </View>
          ))}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
            View cart
          </Text>
          <Text style={styles.sub} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
            {units} {units === 1 ? 'item' : 'items'}
          </Text>
        </View>
        <View style={styles.chev}>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.primaryStrong} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    // A little air under the pill so it never touches the tab bar or the system buttons.
    paddingBottom: theme.spacing.md + 4,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    // A compact pill, not a full-width bar: it should not cover the page behind it.
    maxWidth: 300,
    minWidth: 220,
    width: '68%',
    paddingVertical: theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryStrong,
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: { opacity: 0.92 },
  thumbs: { height: THUMB, marginLeft: theme.spacing.xs },
  thumb: {
    position: 'absolute',
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { flex: 1 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: theme.colors.white },
  sub: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  chev: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
