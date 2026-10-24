import { StyleSheet, TextInput } from 'react-native';

import { theme } from '@/theme';

export interface OtpFieldProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  error?: string;
}

const { colors, radius, spacing, touch } = theme;

/** Single input with SMS one-time-code autofill (design §3.4). Digits only. */
export function OtpField({ value, onChange, length = 6, autoFocus, error }: OtpFieldProps) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="sms-otp"
      maxLength={length}
      autoFocus={autoFocus}
      accessibilityLabel={`${length}-digit code`}
      accessibilityHint={error}
      style={[styles.input, error ? styles.error : null]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: touch.minTouch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  error: { borderColor: colors.danger },
});
