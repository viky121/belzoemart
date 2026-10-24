import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { theme } from '@/theme';

export interface QtyValueProps {
  value: number;
  /** Called with the typed quantity, already clamped to [min, max]; not called when unchanged. */
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  /** Disables editing (the number is shown as plain text). */
  disabled?: boolean;
  /** A change is in flight: show a spinner instead of the number. */
  busy?: boolean;
  /** Accessibility label, e.g. the product title. */
  label?: string;
  /** Colour of the number / typed text / spinner. */
  color?: string;
  textStyle?: StyleProp<TextStyle>;
  /** Width of the number box (the input uses the same). */
  width?: number;
}

/** Parse what was typed: digits only, clamped to the allowed range; null when there is nothing usable. */
export function parseQty(raw: string, min: number, max: number): number | null {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return null;
  return Math.min(max, Math.max(min, Number.parseInt(digits, 10)));
}

/**
 * The number between the "−" and "+" buttons. Tap it to type an exact quantity: the keyboard opens,
 * and leaving the field or pressing Done applies it (clamped to min/max). The "−" / "+" buttons keep
 * working as before.
 */
export function QtyValue({
  value,
  onCommit,
  min = 1,
  max = 99,
  disabled = false,
  busy = false,
  label = 'Quantity',
  color = theme.colors.ink,
  textStyle,
  width = 40,
}: QtyValueProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Blur and "Done" can both fire; apply the typed value only once per edit.
  const applied = useRef(false);

  if (busy) {
    return <ActivityIndicator size="small" color={color} style={{ width }} />;
  }

  function finish() {
    if (applied.current) return;
    applied.current = true;
    const next = parseQty(draft, min, max);
    setEditing(false);
    if (next !== null && next !== value) onCommit(next);
  }

  if (editing) {
    return (
      <TextInput
        testID="qty-input"
        value={draft}
        onChangeText={(t) => setDraft(t.replace(/\D/g, '').slice(0, 3))}
        onBlur={finish}
        onSubmitEditing={finish}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={3}
        autoFocus
        selectTextOnFocus
        accessibilityLabel={`${label} quantity, type a number`}
        maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
        style={[styles.input, { width, color, borderBottomColor: color }, textStyle]}
      />
    );
  }

  return (
    <Pressable
      onPress={() => {
        applied.current = false;
        setDraft(String(value));
        setEditing(true);
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Tap to type a quantity`}
      style={{ width, alignItems: 'center' }}
    >
      <Text
        testID="qty-value"
        maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
        style={[styles.value, { color }, !disabled && styles.hint, !disabled && { textDecorationColor: color }, textStyle]}
      >
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  value: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  // A faint underline tells people the number can be tapped and typed over.
  hint: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  input: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 1.5,
    minHeight: 24,
  },
});
