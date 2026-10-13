import { DEFAULT_HOME_EMART } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { Button } from '@/ui/Button';

import { markOnboardingDone } from '../onboarding-flag';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// Copy adapted from DEFAULT_HOME_EMART.why (design §2.5); no new imagery.
const ICONS: IconName[] = ['truck-fast-outline', 'shield-check-outline', 'credit-card-outline'];
const SLIDES = DEFAULT_HOME_EMART.why.slice(0, 3).map((w, i) => ({
  title: w.title,
  body: w.sub,
  icon: ICONS[i] ?? 'star-outline',
}));

export function OnboardingScreen({ navigation }: RootScreenProps<'Onboarding'>) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index] ?? SLIDES[0]!;
  const last = index >= SLIDES.length - 1;

  const finish = async () => {
    await markOnboardingDone();
    navigation.replace('Main');
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Button
          title="Skip"
          variant="ghost"
          onPress={() => void finish()}
          accessibilityLabel="Skip introduction"
        />
      </View>
      <View style={styles.body}>
        <BelzoLogo size={120} />
        <MaterialCommunityIcons
          name={slide.icon}
          size={72}
          color={theme.colors.brand}
          style={styles.icon}
        />
        <Text style={styles.title} accessibilityRole="header">
          {slide.title}
        </Text>
        <Text style={styles.text}>{slide.body}</Text>
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        <Button
          title={last ? 'Get started' : 'Next'}
          onPress={() => (last ? void finish() : setIndex((i) => i + 1))}
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  top: { alignItems: 'flex-end', paddingHorizontal: theme.spacing.lg },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  icon: { marginTop: theme.spacing.xl },
  title: { ...theme.typography.display, color: theme.colors.inkStrong, textAlign: 'center' },
  text: { ...theme.typography.bodyLg, color: theme.colors.muted, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.slate },
  dotActive: { backgroundColor: theme.colors.primaryStrong, width: 20 },
  footer: { padding: theme.spacing.lg, backgroundColor: theme.colors.navy },
});
