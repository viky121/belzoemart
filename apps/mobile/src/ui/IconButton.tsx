import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface IconButtonProps {
  icon: IconName;
  /** Required for accessibility. */
  label: string;
  onPress: () => void;
  badge?: number;
  color?: string;
  size?: number;
  disabled?: boolean;
  testID?: string;
}

const { colors, touch, typography } = theme;

export function IconButton({
  icon,
  label,
  onPress,
  badge,
  color = colors.ink,
  size = 24,
  disabled = false,
  testID,
}: IconButtonProps) {
  const showBadge = badge !== undefined && badge > 0;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={showBadge ? `${label}, ${badge}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.base, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={size} color={disabled ? colors.mutedSoft : color} />
      {showBadge ? (
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.badgeText} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: touch.minTouch,
    minHeight: touch.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 14,
    color: colors.ink,
    fontWeight: '700',
  },
});
