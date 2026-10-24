import { useState } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/theme';

export interface PasswordFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  autoComplete?: 'current-password' | 'new-password';
  error?: string;
  testID?: string;
}

const { colors, spacing, radius, touch, typography } = theme;

/** Password input with a Show / Hide button, bound to react-hook-form. */
export function PasswordField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  autoComplete = 'current-password',
  error,
  testID,
}: PasswordFieldProps<T>) {
  const [show, setShow] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur } }) => (
        <View style={styles.wrap}>
          <Text style={styles.label}>{label}</Text>
          <View style={[styles.box, error ? styles.boxError : null]}>
            <TextInput
              testID={testID}
              value={value == null ? '' : String(value)}
              onChangeText={onChange}
              onBlur={onBlur}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={autoComplete}
              placeholder={placeholder}
              placeholderTextColor={colors.muted}
              accessibilityLabel={label}
              accessibilityHint={error}
              style={styles.input}
            />
            <Pressable
              onPress={() => setShow((s) => !s)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={show ? 'Hide password' : 'Show password'}
              style={styles.toggle}
            >
              <Text style={styles.toggleText}>{show ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { ...typography.body, color: colors.ink, fontWeight: '500', marginBottom: spacing.xs },
  box: {
    minHeight: touch.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  boxError: { borderColor: colors.danger },
  input: {
    flex: 1,
    minHeight: touch.minTouch,
    paddingHorizontal: spacing.md,
    ...typography.bodyLg,
    color: colors.ink,
  },
  toggle: { paddingHorizontal: spacing.md, minHeight: touch.minTouch, justifyContent: 'center' },
  toggleText: { ...typography.body, color: colors.primaryStrong, fontWeight: '700' },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
});
