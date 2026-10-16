import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { BrandSplash } from '@/ui/brand/BrandSplash';

import { markOnboardingDone } from '../onboarding-flag';

/** First-run screen: the Belzo Mart brand splash with a "Get Started" call to action. */
export function OnboardingScreen({ navigation }: RootScreenProps<'Onboarding'>) {
  const insets = useSafeAreaInsets();
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
          </Pressable>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  cta: {
    minHeight: 50,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  ctaText: { fontSize: 16, fontWeight: '800', color: theme.colors.primaryStrong },
});
