import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { BrandSplash, SPLASH_LOGO } from '@/ui/brand/BrandSplash';

/** Branded launch animation: the logo springs in over the brand splash, then the screen fades out. */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [scale] = useState(() => new Animated.Value(0.6));
  const [opacity] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
      Animated.delay(900),
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => onDone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: fade }]}>
      <BrandSplash
        bottomInset={insets.bottom}
        logo={
          <Animated.View style={{ opacity, transform: [{ scale }] }}>
            <BelzoLogo size={SPLASH_LOGO} />
          </Animated.View>
        }
      />
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
    zIndex: 1000,
  },
});
