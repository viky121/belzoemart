import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View, type DimensionValue } from 'react-native';

import { theme } from '@/theme';

export interface SkeletonProps {
  width: DimensionValue;
  height: DimensionValue;
  radius?: number;
}

/** Pulsing placeholder block; the pulse is off when Reduce Motion is enabled. */
export function Skeleton({ width, height, radius = theme.radius.sm }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);

  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius: radius, opacity }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.grid} accessibilityLabel="Loading" accessible>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.gridItem}>
          <Skeleton width="100%" height={140} radius={theme.radius.md} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="40%" height={14} />
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading" accessible>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listRow}>
          <Skeleton width={56} height={56} radius={theme.radius.md} />
          <View style={styles.listText}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DetailSkeleton() {
  return (
    <View style={styles.list} accessibilityLabel="Loading" accessible>
      <Skeleton width="100%" height={280} radius={theme.radius.md} />
      <Skeleton width="85%" height={20} />
      <Skeleton width="50%" height={20} />
      <Skeleton width="100%" height={80} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: theme.colors.border2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: theme.spacing.sm },
  gridItem: { width: '50%', padding: theme.spacing.sm, gap: theme.spacing.sm },
  list: { padding: theme.spacing.lg, gap: theme.spacing.md },
  listRow: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' },
  listText: { flex: 1, gap: theme.spacing.sm },
});
