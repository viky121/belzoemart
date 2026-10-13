import { pincodeSchema } from '@belzo/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { usePincodeStore } from '@/store/pincode';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { Sheet } from '@/ui/Sheet';

import { useServiceabilityCheck } from '../hooks';

export interface PincodeSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Delivery PIN sheet (design §11 Home): validate with pincodeSchema, then show serviceability. */
export function PincodeSheet({ visible, onClose }: PincodeSheetProps) {
  const current = usePincodeStore((s) => s.pincode);
  const setPincode = usePincodeStore((s) => s.setPincode);
  const [pin, setPin] = useState(current ?? '');
  const [wasVisible, setWasVisible] = useState(visible);
  const check = useServiceabilityCheck();

  const valid = pincodeSchema.safeParse(pin).success;

  // Reset the input to the stored PIN each time the sheet opens (render-time
  // state adjustment, not an effect — avoids a cascading-render warning).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPin(current ?? '');
  }

  useEffect(() => {
    if (valid) check.mutate(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  let status = '';
  if (valid && check.isSuccess) {
    status = !check.data.configured
      ? 'Delivery available everywhere.'
      : check.data.serviceable
        ? `Delivers to ${pin}.`
        : `Not deliverable to ${pin} yet.`;
  } else if (valid && check.isError) {
    status = "Couldn't check delivery. Try again.";
  }

  function save() {
    setPincode(pin);
    onClose();
  }

  return (
    <Sheet visible={visible} title="Delivery PIN" onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.label}>Enter your 6-digit PIN code</Text>
        <TextInput
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="e.g. 560001"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          accessibilityLabel="Delivery PIN code"
          autoFocus
        />
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <Button title="Save PIN" fullWidth disabled={!valid} onPress={save} testID="pincode-save" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingVertical: theme.spacing.md, gap: theme.spacing.md },
  label: { ...theme.typography.body, color: theme.colors.ink },
  input: {
    minHeight: theme.touch.minTouch,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: 20,
    letterSpacing: 4,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
  },
  status: { ...theme.typography.caption, color: theme.colors.muted },
});
