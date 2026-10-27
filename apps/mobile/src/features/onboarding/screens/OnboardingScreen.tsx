import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '@/lib/use-bottom-inset';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { BrandSplash } from '@/ui/brand/BrandSplash';

import { markOnboardingDone } from '../onboarding-flag';

/** First-run screen: the Belzo eMart brand splash with a "Get Started" call to action. */
export function OnboardingScreen({ navigation }: RootScreenProps<'Onboarding'>) {
  const insets = useInsets();
  const finish = async () => {
    await markOnboardingDone();
    navigation.replace('Main');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <BrandSplash
        bottomInset={insets.bottom}
        footer={
          <Pressable
            onPress={() => void finish()}
            accessibilityRole="button"
            accessibilityLabel="Get started"
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>Get Started</Text>
            <View style={styles.arrow}>
              <MaterialCommunityIcons name="arrow-right" size={18} color={theme.colors.white} />
            </View>
          </Pressable>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  cta: {
    minHeight: 54,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pressed: { opacity: 0.85 },
  ctaText: { fontSize: 16, fontWeight: '800', color: theme.colors.primaryStrong },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
