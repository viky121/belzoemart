import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { theme } from '@/theme';

import { Gradient } from '../Gradient';
import { BelzoLogo } from './BelzoLogo';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const BADGES: { icon: IconName; label: string }[] = [
  { icon: 'shield-check-outline', label: 'Quality\nProducts' },
  { icon: 'tag-outline', label: 'Best\nPrices' },
  { icon: 'truck-fast-outline', label: 'Fast\nDelivery' },
];

const { width: W } = Dimensions.get('window');
const WAVE_H = 120;
const HALO = Math.min(330, W * 0.86);
/** Logo size that fits inside the circle with room left for the tagline. */
export const SPLASH_LOGO = Math.round(HALO * 0.56);

/**
 * Belzo eMart brand splash: the official logo inside a circle together with
 * "Shop More. Live Better." (second half in orange), the sub line below the circle, a green wave with an
 * orange accent at the bottom, and three trust badges in rounded chips.
 * `logo` lets callers wrap the logo (e.g. in an animated view); `footer` adds a CTA.
 */
export function BrandSplash({
  logo,
  footer,
  bottomInset = 0,
}: {
  logo?: ReactNode;
  footer?: ReactNode;
  bottomInset?: number;
}) {
  return (
    <Gradient colors={['#eef8f3', '#ffffff']} style={styles.root}>
      <View style={styles.hero}>
        {/* Decorative dots, purely visual. */}
        <View style={styles.decor} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.dot, { top: '16%', left: '14%', backgroundColor: theme.colors.orange }]} />
          <View style={[styles.dot, styles.dotSm, { top: '24%', right: '16%', backgroundColor: theme.colors.primary }]} />
          <View style={[styles.dot, styles.dotSm, { bottom: '20%', left: '20%', backgroundColor: theme.colors.yellow }]} />
          <View style={[styles.dot, { bottom: '14%', right: '14%', backgroundColor: theme.colors.primary, opacity: 0.5 }]} />
        </View>

        {/* Circle: logo and "Shop More. Live Better." sit inside the border. */}
        <View style={[styles.circle, { width: HALO, height: HALO, borderRadius: HALO / 2 }]}>
          {logo ?? <BelzoLogo size={SPLASH_LOGO} />}
          <Text style={styles.tagline} accessibilityRole="header">
            Shop More. <Text style={styles.taglineAccent}>Live Better.</Text>
          </Text>
        </View>

        {/* Outside the circle. */}
        <Text style={styles.sub}>Groceries and daily essentials, at your door.</Text>
      </View>

      <View>
        <Svg width={W} height={WAVE_H} viewBox={`0 0 ${W} ${WAVE_H}`} style={styles.wave}>
          <Path
            d={`M0 ${WAVE_H * 0.7} C ${W * 0.3} ${WAVE_H * 0.15}, ${W * 0.65} ${WAVE_H * 0.95}, ${W} ${WAVE_H * 0.2} L ${W} ${WAVE_H} L 0 ${WAVE_H} Z`}
            fill={theme.colors.orange}
          />
          <Path
            d={`M0 ${WAVE_H * 0.85} C ${W * 0.3} ${WAVE_H * 0.35}, ${W * 0.65} ${WAVE_H * 1.05}, ${W} ${WAVE_H * 0.38} L ${W} ${WAVE_H} L 0 ${WAVE_H} Z`}
            fill={theme.colors.primaryStrong}
          />
        </Svg>
        <View style={[styles.green, { paddingBottom: bottomInset + theme.spacing.xl }]}>
          <View style={styles.badges}>
            {BADGES.map((b) => (
              <View key={b.label} style={styles.badge}>
                <View style={styles.badgeIcon}>
                  <MaterialCommunityIcons name={b.icon} size={22} color={theme.colors.white} />
                </View>
                <Text style={styles.badgeLabel}>{b.label}</Text>
              </View>
            ))}
          </View>
          {footer}
        </View>
      </View>
    </Gradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  decor: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'rgba(27,122,94,0.28)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  dotSm: { width: 8, height: 8, borderRadius: 4 },
  tagline: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: theme.colors.inkStrong, textAlign: 'center' },
  taglineAccent: { color: theme.colors.orange },
  sub: { ...theme.typography.body, color: theme.colors.muted, textAlign: 'center' },
  wave: { marginBottom: -1 },
  green: {
    backgroundColor: theme.colors.primaryStrong,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  badges: { flexDirection: 'row', gap: theme.spacing.sm },
  badge: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badgeLabel: {
    ...theme.typography.caption,
    color: theme.colors.white,
    textAlign: 'center',
    fontWeight: '700',
  },
});
