import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';

import { QtyValue } from './QtyValue';

export interface CompactStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Smallest value the stepper can reach through "−" (default 1; use 0 to allow removal). */
  min?: number;
  max?: number;
  disabled?: boolean;
  /** A mutation is in flight: spinner instead of the number and both buttons disabled. */
  busy?: boolean;
  /** Accessibility label, e.g. the product title. */
  label?: string;
}

const SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Filled brand-colour "− 1 +" pill (Belzo eMart cart + cards). */
export function CompactStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  busy = false,
  label = 'Quantity',
}: CompactStepperProps) {
  const brand = useBrand();
  const inactive = disabled || busy;
  const canDec = !inactive && value > min;
  const canInc = !inactive && value < max;
  return (
    <View
      style={[styles.row, { backgroundColor: brand.primary }]}
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
      <Pressable
        onPress={() => onChange(value - 1)}
        disabled={!canDec}
        hitSlop={SLOP}
        style={[styles.btn, !canDec && styles.btnOff]}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        testID="qty-decrement"
      >
        <MaterialCommunityIcons name="minus" size={18} color={theme.colors.white} />
      </Pressable>
      <View style={styles.value}>
        <QtyValue
          value={value}
          onCommit={onChange}
          min={min}
          max={max}
          disabled={inactive}
          busy={busy}
          label={label}
          color={theme.colors.white}
          width={40}
        />
      </View>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={!canInc}
        hitSlop={SLOP}
        style={[styles.btn, !canInc && styles.btnOff]}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        testID="qty-increment"
      >
        <MaterialCommunityIcons name="plus" size={18} color={theme.colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: theme.radius.md,
    height: 36,
  },
  btn: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  btnOff: { opacity: 0.45 },
  value: { minWidth: 26, alignItems: 'center' },
  valueText: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: theme.colors.white },
});
