import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { theme } from '@/theme';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';

/** Branded launch animation: logo springs in, holds, then the whole screen fades out. */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const [scale] = useState(() => new Animated.Value(0.6));
  const [opacity] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
      Animated.delay(650),
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => onDone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: fade }]}>
      <Animated.View style={[styles.inner, { opacity, transform: [{ scale }] }]}>
        <BelzoLogo size={100} />
        <Text style={styles.word}>
          Belzo <Text style={styles.accent}>Mart</Text>
        </Text>
        <Text style={styles.tag}>Shop More. Live Better.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  inner: { alignItems: 'center', gap: theme.spacing.md },
  word: { ...theme.typography.display, fontSize: 30, lineHeight: 36, color: theme.colors.ink },
  accent: { color: theme.colors.primaryStrong },
  tag: { ...theme.typography.bodyLg, color: theme.colors.muted },
});
