import { pincodeSchema } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePincodeStore } from '@/store/pincode';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';

import { useServiceabilityCheck } from '../hooks';

/**
 * Mandatory first-run delivery-PIN gate (mirrors the web PIN gate): a blocking
 * full-screen overlay shown until a 6-digit PIN is entered. Mounted inside the
 * main tabs so it only appears once the storefront is reached.
 */
export function PincodeGate() {
  const pincode = usePincodeStore((s) => s.pincode);
  const setPincode = usePincodeStore((s) => s.setPincode);
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const check = useServiceabilityCheck();
  const valid = pincodeSchema.safeParse(pin).success;

  useEffect(() => {
    if (valid) check.mutate(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (pincode) return null;

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
    <View style={styles.overlay}>
      <View style={[styles.card, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <View style={styles.brand}>
          <BelzoLogo size={44} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
    zIndex: 500,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
