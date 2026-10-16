import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
  fullWidth?: boolean;
  testID?: string;
}

const { colors, button, spacing, radius, touch, typography } = theme;

/** `main` is the brand colour: the normal green, or the active festival's primary. */
function palette(variant: ButtonVariant, main: string): { bg: string; fg: string; border: string } {
  switch (variant) {
    case 'primary':
      return { bg: main, fg: colors.white, border: main };
    case 'accent':
      return { bg: button.accentFill, fg: colors.white, border: button.accentFill };
    case 'secondary':
      return { bg: colors.surface, fg: main, border: main };
    case 'ghost':
      return { bg: 'transparent', fg: main, border: 'transparent' };
    case 'danger':
      return { bg: colors.danger, fg: colors.white, border: colors.danger };
  }
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
  style,
  fullWidth,
  testID,
}: ButtonProps) {
  const brand = useBrand();
  const p = palette(variant, brand.primary);
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: p.bg, borderColor: inactive ? colors.slate : p.border },
        inactive && variant !== 'ghost' && variant !== 'secondary' && styles.disabledFill,
        pressed && !inactive && styles.pressed,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={p.fg} size="small" style={styles.icon} />
        ) : icon ? (
          <MaterialCommunityIcons
            name={icon}
            size={20}
            color={inactive ? colors.mutedSoft : p.fg}
            style={styles.icon}
          />
        ) : null}
        <Text
          style={[
            styles.label,
            {
              color:
                inactive && variant !== 'primary' && variant !== 'accent' && variant !== 'danger'
                  ? colors.mutedSoft
                  : p.fg,
            },
          ]}
          maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.minTouch,
    minWidth: touch.minTouch,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledFill: { backgroundColor: colors.slate },
  pressed: { opacity: 0.85 },
  fullWidth: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.sm },
  label: { ...typography.bodyLg, fontWeight: theme.fontWeight.bold },
});
