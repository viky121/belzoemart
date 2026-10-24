import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { theme } from '@/theme';

export interface TextFieldProps<T extends FieldValues>
  extends Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  error?: string;
}

const { colors, spacing, radius, touch, typography } = theme;

/** react-hook-form text input with a visible label and an error linked through the hint. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  error,
  ...inputProps
}: TextFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur } }) => (
        <View style={styles.wrap}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            {...inputProps}
            value={value == null ? '' : String(value)}
            onChangeText={onChange}
            onBlur={onBlur}
            accessibilityLabel={label}
            accessibilityHint={error}
            placeholderTextColor={colors.muted}
            style={[styles.input, error ? styles.inputError : null]}
          />
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
  input: {
    minHeight: touch.minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    ...typography.bodyLg,
  },
  inputError: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
});
