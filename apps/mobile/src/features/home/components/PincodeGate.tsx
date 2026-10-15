import { pincodeSchema } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { usePincodeStore } from '@/store/pincode';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';

import { useServiceabilityCheck } from '../hooks';

/**
 * Mandatory first-run delivery-PIN gate (mirrors the web PIN gate): a blocking,
 * centered dialog shown until a 6-digit PIN is entered. Centered + inside a
 * Modal with KeyboardAvoidingView so the input stays visible above the keyboard.
 */
export function PincodeGate() {
  const pincode = usePincodeStore((s) => s.pincode);
  const setPincode = usePincodeStore((s) => s.setPincode);
  const [pin, setPin] = useState('');
  const check = useServiceabilityCheck();
  const valid = pincodeSchema.safeParse(pin).success;

  useEffect(() => {
    if (valid) check.mutate(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  let status = '';
  let serviceable = true;
  if (valid && check.isSuccess) {
    if (!check.data.configured) status = 'Great! We deliver to your area.';
    else if (check.data.serviceable) status = `Great! We deliver to ${pin}.`;
    else {
      status = `Sorry, we don't deliver to ${pin} yet.`;
      serviceable = false;
    }
  }

  return (
    <Modal
      visible={!pincode}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.brand}>
            <BelzoLogo size={56} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Enter your delivery PIN code
          </Text>
          <Text style={styles.sub}>
            We check delivery availability before you shop. Please enter a 6-digit PIN code to
            continue.
          </Text>

          <View style={styles.inputRow}>
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={20}
              color={theme.colors.primaryStrong}
            />
            <TextInput
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="e.g. 110001"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              accessibilityLabel="Delivery PIN code"
              autoFocus
              returnKeyType="done"
            />
          </View>

          {status ? (
            <Text style={[styles.status, !serviceable && styles.statusBad]}>{status}</Text>
          ) : null}

          <Button
            title="Continue"
            fullWidth
            disabled={!valid}
            onPress={() => setPincode(pin)}
            testID="pincode-gate-continue"
            style={styles.cta}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  brand: { alignItems: 'center', marginBottom: theme.spacing.xs },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong, textAlign: 'center' },
  sub: {
    ...theme.typography.body,
    color: theme.colors.muted,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface2,
  },
  input: {
    flex: 1,
    minHeight: theme.touch.minTouch,
    fontSize: 20,
    letterSpacing: 4,
    color: theme.colors.ink,
    paddingVertical: 0,
  },
  status: { ...theme.typography.body, color: theme.colors.brandStrong, fontWeight: '600' },
  statusBad: { color: theme.colors.danger },
  cta: { marginTop: theme.spacing.sm },
});
