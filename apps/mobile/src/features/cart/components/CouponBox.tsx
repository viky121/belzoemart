import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { requireAuth } from '@/navigation/RequireAuth';
import type { RootStackParamList } from '@/navigation/types';
import { useCheckoutDraft } from '@/store/checkout-draft';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { Button } from '@/ui';

import { useValidateCoupon } from '../hooks';

export interface CouponBoxProps {
  subtotal: number;
}

/** Coupon entry (design §6.5): guests go through requireAuth; a valid code is kept for Checkout. */
export function CouponBox({ subtotal }: CouponBoxProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  const applied = useCheckoutDraft((s) => s.couponCode);
  const setCouponCode = useCheckoutDraft((s) => s.setCouponCode);
  const [code, setCode] = useState('');
  const validate = useValidateCoupon();

  function apply() {
    if (!isCustomer) {
      requireAuth(navigation, { name: 'Main', params: { screen: 'CartTab' } });
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) return;
    validate.mutate(
      { code: trimmed, subtotal },
      {
        onSuccess: (res) => {
          if (res.valid) setCouponCode(res.code);
        },
      },
    );
  }

  const result = validate.data;
  const message =
    applied && (!result || result.valid)
      ? `Coupon ${applied} applied`
      : result && !result.valid
        ? (result.reason ?? 'Invalid coupon')
        : '';
  const messageTone = result && !result.valid ? theme.colors.danger : theme.colors.brandStrong;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Have a coupon code?"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Coupon code"
        />
        <Button title="Apply" variant="secondary" onPress={apply} loading={validate.isPending} testID="coupon-apply" />
      </View>
      {message ? <Text style={[styles.message, { color: messageTone }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: theme.spacing.xs },
  row: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: theme.touch.minTouch,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
    ...theme.typography.body,
  },
  message: { ...theme.typography.caption },
});
