import { StyleSheet, View } from 'react-native';

import { theme } from '@/theme';

import { IconButton } from './IconButton';
import { QtyValue } from './QtyValue';

export interface QuantitySelectorProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** A mutation for this line is in flight; the selector is disabled meanwhile. */
  busy?: boolean;
  /** Used in the accessibility label, e.g. the product title. */
  label?: string;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  busy = false,
  label = 'Quantity',
}: QuantitySelectorProps) {
  const inactive = disabled || busy;
  const canDec = !inactive && value > min;
  const canInc = !inactive && value < max;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: String(value) }}
      accessibilityState={{ disabled: inactive, busy }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && canInc) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && canDec) onChange(value - 1);
      }}
    >
      <IconButton
        icon="minus"
        label={`Decrease ${label}`}
        onPress={() => onChange(value - 1)}
        disabled={!canDec}
        testID="qty-decrement"
      />
      <View style={styles.value}>
        <QtyValue
          value={value}
          onCommit={onChange}
          min={min}
          max={max}
          disabled={inactive}
          busy={busy}
          label={label}
          color={busy ? theme.colors.primaryStrong : theme.colors.ink}
          textStyle={styles.valueText}
          width={44}
        />
      </View>
      <IconButton
        icon="plus"
        label={`Increase ${label}`}
        onPress={() => onChange(value + 1)}
        disabled={!canInc}
        testID="qty-increment"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
  },
  value: { minWidth: 36, alignItems: 'center' },
  valueText: { ...theme.typography.bodyLg, color: theme.colors.ink, fontWeight: '700' },
});
