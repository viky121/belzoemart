import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/theme';

export interface SearchBarProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: (text: string) => void;
  /** false renders the non-editable "fake" bar used on Home; tapping it calls onPress. */
  editable?: boolean;
  onPress?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

const { colors, spacing, radius, touch, typography } = theme;

export function SearchBar({
  value = '',
  onChangeText,
  onSubmit,
  editable = true,
  onPress,
  placeholder = 'Search for products',
  autoFocus,
}: SearchBarProps) {
  if (!editable) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        style={styles.bar}
      >
        <MaterialCommunityIcons name="magnify" size={22} color={colors.muted} />
        <Text style={styles.placeholder} numberOfLines={1}>
          {placeholder}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.bar}>
      <MaterialCommunityIcons name="magnify" size={22} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={(e) => onSubmit?.(e.nativeEvent.text)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: touch.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  placeholder: { ...typography.bodyLg, color: colors.muted, marginLeft: spacing.sm, flex: 1 },
  input: {
    ...typography.bodyLg,
    color: colors.ink,
    marginLeft: spacing.sm,
    flex: 1,
    paddingVertical: 0,
  },
});
