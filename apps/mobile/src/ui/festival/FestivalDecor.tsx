import type { FestivalMotif } from '@belzo/shared';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { FestivalGlyph } from './FestivalGlyph';

/** Whether the OS asks for reduced motion (then decorations stay still). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const PIECES = 9;

/** Deterministic layout so renders are stable (no Math.random). */
function layout(i: number) {
  return {
    left: `${(i * 37 + 11) % 92}%` as const,
    size: 14 + (i % 3) * 4,
    duration: 5200 + (i % 4) * 900,
    delay: i * 650,
  };
}

function Piece({
  i,
  motif,
  color,
  accent,
  height,
  animated,
}: {
  i: number;
  motif: FestivalMotif;
  color: string;
  accent: string;
  height: number;
  animated: boolean;
}) {
  const { left, size, duration, delay } = layout(i);
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, delay, duration, t]);

  const staticY = (i * 23) % Math.max(height - size, 1);
  const style = animated
    ? {
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.85, 0.85, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-size, height] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '30deg'] }) },
        ],
      }
    : { opacity: 0.5, transform: [{ translateY: staticY }] };

  return (
    <Animated.View style={[styles.piece, { left }, style]}>
      <FestivalGlyph motif={motif} size={size} color={color} accent={accent} />
    </Animated.View>
  );
}

export interface FestivalDecorProps {
  motifs: readonly FestivalMotif[];
  /** Glyph colour (use a light colour on the dark festival header). */
  color: string;
  accent: string;
  /** Container height the pieces travel through. */
  height: number;
  /** Admin toggle. When false nothing is drawn. */
  enabled: boolean;
}

/**
 * Festive glyphs drifting down behind the header content. Purely decorative: not
 * focusable, ignores touches, hidden from screen readers, and held still when the
 * OS "reduce motion" setting is on.
 */
export function FestivalDecor({ motifs, color, accent, height, enabled }: FestivalDecorProps) {
  const reduce = useReduceMotion();
  if (!enabled || motifs.length === 0) return null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="festival-decor"
    >
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece
          key={i}
          i={i}
          motif={motifs[i % motifs.length]!}
          color={color}
          accent={accent}
          height={height}
          animated={!reduce}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0 },
});
