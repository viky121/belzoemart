import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { Button } from '@/ui/Button';

import { markOnboardingDone } from '../onboarding-flag';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Trust badges shown on the splash (design §2.5). */
const BADGES: { icon: IconName; label: string }[] = [
  { icon: 'shield-check-outline', label: 'Quality\nProducts' },
  { icon: 'sale-outline', label: 'Best\nPrices' },
  { icon: 'truck-fast-outline', label: 'Fast\nDelivery' },
];

/** Branded splash / first-run screen (design §2.5): logo + tagline + trust badges. */
export function OnboardingScreen({ navigation }: RootScreenProps<'Onboarding'>) {
  const finish = async () => {
    await markOnboardingDone();
    navigation.replace('Main');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.top}>
        <Button
          title="Skip"
          variant="ghost"
          onPress={() => void finish()}
          accessibilityLabel="Skip introduction"
        />
      </View>

      <View style={styles.hero}>
        <BelzoLogo size={128} />
        <Text style={styles.wordmark} accessibilityRole="header">
          Belzo <Text style={styles.wordmarkAccent}>Mart</Text>
        </Text>
        <Text style={styles.tagline}>Shop More. Live Better.</Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.badges}>
          {BADGES.map((b) => (
            <View key={b.label} style={styles.badge}>
              <View style={styles.badgeIcon}>
                <MaterialCommunityIcons name={b.icon} size={24} color={theme.colors.white} />
              </View>
              <Text style={styles.badgeLabel}>{b.label}</Text>
            </View>
          ))}
        </View>
        <Button
          title="Get started"
          variant="secondary"
          onPress={() => void finish()}
          fullWidth
          style={styles.cta}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  top: { alignItems: 'flex-end', paddingHorizontal: theme.spacing.lg },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
  },
  wordmark: { ...theme.typography.display, fontSize: 30, lineHeight: 36, color: theme.colors.ink },
  wordmarkAccent: { color: theme.colors.primaryStrong },
  tagline: { ...theme.typography.bodyLg, color: theme.colors.muted },
  panel: {
    backgroundColor: theme.colors.primaryStrong,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 4,
    borderTopColor: theme.colors.orange,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  badges: { flexDirection: 'row', justifyContent: 'space-around' },
  badge: { alignItems: 'center', gap: theme.spacing.xs },
  badgeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    ...theme.typography.caption,
    color: theme.colors.white,
    textAlign: 'center',
    fontWeight: '600',
  },
  cta: { backgroundColor: theme.colors.white },
});
