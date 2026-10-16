import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { usePincodeStore } from '@/store/pincode';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';

import { usePinStatus } from '../hooks';

/**
 * Mandatory delivery-PIN gate (mirrors the web PIN gate). Blocks the storefront
 * until the shopper enters a PIN we actually deliver to. It also re-opens when a
 * previously saved PIN is no longer deliverable, so nobody shops on a PIN we
 * cannot serve. Network errors never unlock it.
 */
export function PincodeGate() {
  const stored = usePincodeStore((s) => s.pincode);
  const setPincode = usePincodeStore((s) => s.setPincode);
  const storedStatus = usePinStatus(stored).status;

  const [pin, setPin] = useState('');
  const { status, refetch } = usePinStatus(pin.length === 6 ? pin : null);

  const visible = !stored || storedStatus === 'blocked';
  const canContinue = status === 'deliverable';

  let message = '';
  let tone: 'ok' | 'bad' | 'muted' = 'muted';
  if (status === 'checking') message = 'Checking delivery…';
  else if (status === 'deliverable') {
    message = `Great! We deliver to ${pin}.`;
    tone = 'ok';
  } else if (status === 'blocked') {
    message = `Sorry, we don't deliver to ${pin} yet. Please try another PIN code.`;
    tone = 'bad';
  } else if (status === 'error') {
    message = "Couldn't check delivery. Check your connection and try again.";
    tone = 'bad';
  }

  return (
    <Modal
      visible={visible}
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
            <BelzoLogo size={64} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Enter your delivery PIN code
          </Text>
          <Text style={styles.sub}>
            We currently deliver to selected areas only. Enter your 6-digit PIN code to check
            availability.
          </Text>
          {stored && storedStatus === 'blocked' ? (
            <Text style={styles.notice}>
              We no longer deliver to your saved PIN {stored}. Please enter another one.
            </Text>
          ) : null}

          <View
            style={[
              styles.inputRow,
              tone === 'ok' && styles.inputOk,
              tone === 'bad' && styles.inputBad,
            ]}
          >
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={20}
              color={theme.colors.primaryStrong}
            />
            <TextInput
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="e.g. 472001"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              accessibilityLabel="Delivery PIN code"
              autoFocus
              returnKeyType="done"
              maxLength={6}
            />
            {status === 'checking' ? (
              <ActivityIndicator size="small" color={theme.colors.primaryStrong} />
            ) : status === 'deliverable' ? (
              <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.brandStrong} />
            ) : status === 'blocked' ? (
              <MaterialCommunityIcons name="close-circle" size={20} color={theme.colors.danger} />
            ) : null}
          </View>

          {message ? (
            <Text
              style={[styles.status, tone === 'ok' && styles.statusOk, tone === 'bad' && styles.statusBad]}
              accessibilityLiveRegion="polite"
              testID="pincode-gate-status"
            >
              {message}
            </Text>
          ) : null}

          {status === 'error' ? (
            <Button title="Try again" variant="secondary" fullWidth onPress={() => void refetch()} />
          ) : null}

          <Button
            title="Continue"
            fullWidth
            disabled={!canContinue}
            onPress={() => {
              setPincode(pin);
              setPin('');
            }}
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
  notice: {
    ...theme.typography.caption,
    color: theme.colors.warnText,
    backgroundColor: theme.colors.warnBg,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    textAlign: 'center',
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
  inputOk: { borderColor: theme.colors.brandStrong },
  inputBad: { borderColor: theme.colors.danger },
  input: {
    flex: 1,
    minHeight: theme.touch.minTouch,
    fontSize: 20,
    letterSpacing: 4,
    color: theme.colors.ink,
    paddingVertical: 0,
  },
  status: { ...theme.typography.body, color: theme.colors.muted },
  statusOk: { color: theme.colors.brandStrong, fontWeight: '600' },
  statusBad: { color: theme.colors.danger, fontWeight: '600' },
  cta: { marginTop: theme.spacing.sm },
});
