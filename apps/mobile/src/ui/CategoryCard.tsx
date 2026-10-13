import type { CategoryNodeDto } from '@belzo/shared';
import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/theme';

import { RemoteImage } from './RemoteImage';

export interface CategoryCardProps {
  node: CategoryNodeDto;
  onPress: () => void;
  size?: number;
}

/** Category tile: image, or a lettered circle when imageUrl is unusable. */
export function CategoryCard({ node, onPress, size = 64 }: CategoryCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={node.name}
      style={({ pressed }) => [styles.card, { width: size + 24 }, pressed && styles.pressed]}
    >
      <RemoteImage
        uri={node.imageUrl}
        width={size}
        height={size}
        radius={size / 2}
        fallbackLabel={node.name}
      />
      <Text style={styles.name} numberOfLines={2}>
        {node.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', minHeight: theme.touch.minTouch, gap: theme.spacing.xs },
  pressed: { opacity: 0.7 },
  name: { ...theme.typography.caption, color: theme.colors.ink, textAlign: 'center' },
});
