import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { theme } from '@/theme';

import { BelzoLogo } from './BelzoLogo';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const BADGES: { icon: IconName; label: string }[] = [
  { icon: 'shield-check-outline', label: 'Quality\nProducts' },
  { icon: 'tag-outline', label: 'Best\nPrices' },
  { icon: 'truck-fast-outline', label: 'Fast\nDelivery' },
];

const { width: W } = Dimensions.get('window');
const WAVE_H = 120;

/**
 * Belzo Mart brand splash (design): official logo + "Shop More. Live Better." on white,
 * a green wave with an orange accent at the bottom, and three trust badges.
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
    <View style={styles.root}>
      <View style={styles.hero}>
        {logo ?? <BelzoLogo size={Math.min(240, W * 0.6)} />}
        <Text style={styles.tagline}>Shop More. Live Better.</Text>
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
            {BADGES.map((b, i) => (
              <View key={b.label} style={[styles.badge, i > 0 && styles.badgeDivider]}>
                <MaterialCommunityIcons name={b.icon} size={28} color={theme.colors.white} />
                <Text style={styles.badgeLabel}>{b.label}</Text>
              </View>
            ))}
          </View>
          {footer}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  tagline: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: theme.colors.inkStrong },
  wave: { marginBottom: -1 },
  green: {
    backgroundColor: theme.colors.primaryStrong,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  badges: { flexDirection: 'row' },
  badge: { flex: 1, alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.xs },
  badgeDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.35)' },
  badgeLabel: {
    ...theme.typography.caption,
    color: theme.colors.white,
    textAlign: 'center',
    fontWeight: '600',
  },
});
