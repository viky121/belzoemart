import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { usePincodeStore } from '@/store/pincode';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { Sheet } from '@/ui/Sheet';

import { usePinStatus } from '../hooks';

export interface PincodeSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Change delivery PIN: only a PIN we deliver to can be saved. */
export function PincodeSheet({ visible, onClose }: PincodeSheetProps) {
  const current = usePincodeStore((s) => s.pincode);
  const setPincode = usePincodeStore((s) => s.setPincode);
  const [pin, setPin] = useState(current ?? '');
  const [wasVisible, setWasVisible] = useState(visible);
  const { status, refetch } = usePinStatus(pin.length === 6 ? pin : null);

  // Reset the input to the stored PIN each time the sheet opens (render-time
  // state adjustment, not an effect — avoids a cascading-render warning).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPin(current ?? '');
  }

  let message = '';
  let bad = false;
  if (status === 'checking') message = 'Checking delivery…';
  else if (status === 'deliverable') message = `We deliver to ${pin}.`;
  else if (status === 'blocked') {
    message = `Sorry, we don't deliver to ${pin} yet.`;
    bad = true;
  } else if (status === 'error') {
    message = "Couldn't check delivery. Try again.";
    bad = true;
  }

  return (
    <Sheet visible={visible} title="Delivery PIN" onClose={onClose}>
      <View style={styles.body}>
        <Text style={styles.label}>Enter your 6-digit PIN code</Text>
        <TextInput
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="e.g. 472001"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          accessibilityLabel="Delivery PIN code"
          maxLength={6}
          autoFocus
        />
        {message ? (
          <Text style={[styles.status, bad ? styles.bad : styles.ok]} accessibilityLiveRegion="polite">
            {message}
          </Text>
        ) : null}
        {status === 'error' ? (
          <Button title="Try again" variant="secondary" fullWidth onPress={() => void refetch()} />
        ) : null}
        <Button
          title="Save PIN"
          fullWidth
          disabled={status !== 'deliverable'}
          onPress={() => {
            setPincode(pin);
            onClose();
          }}
          testID="pincode-save"
        />
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
  status: { ...theme.typography.body },
  ok: { color: theme.colors.brandStrong, fontWeight: '600' },
  bad: { color: theme.colors.danger, fontWeight: '600' },
});
