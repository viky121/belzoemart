import { breakupView, formatInr, snapshotFromBreakup } from '@belzo/shared';
import { usePreventRemove } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toApiError, userMessage } from '@/api/errors';
import { qk } from '@/api/query-keys';
import { useAddresses } from '@/features/addresses/hooks';
import { useCart } from '@/features/cart/hooks';
import { getPaymentAdapter } from '@/features/payments/registry';
import type { RootScreenProps } from '@/navigation/types';
import { useCheckoutDraft } from '@/store/checkout-draft';
import { useSessionStore } from '@/store/session';
import { env } from '@/config/env';
import { theme } from '@/theme';
import { addressLines, Button, EmptyState, ErrorState, RadioRow, Screen } from '@/ui';
import { useToast } from '@/ui/Toast';

import { cancelOrder, placeOrder } from '../api';
import {
  availableMethods,
  preselectMethod,
  selectCheckoutAddress,
  type CheckoutMethod,
} from '../checkout-selection';
import { computeFingerprint, getOrCreateAttempt, settleAttempt } from '../checkout-attempt';
import { handlePaymentOutcome } from '../payment-outcome';
import { usePreview } from '../hooks';

const AMBIGUOUS_COPY =
  "We couldn't confirm your order. Check your connection and tap Place order again — you won't be charged twice.";

/** Checkout (design §6.6, §11): address, payment method, preview, idempotent place, payment adapter. */
export function CheckoutScreen({ navigation, route }: RootScreenProps<'Checkout'>) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const toast = useToast();
  const customer = useSessionStore((s) => s.customer);

  const addressesQuery = useAddresses();
  const cart = useCart();
  const couponCode = useCheckoutDraft((s) => s.couponCode);
  const setCouponCode = useCheckoutDraft((s) => s.setCouponCode);

  const addresses = addressesQuery.data ?? [];
  const address = selectCheckoutAddress(addresses, route.params?.addressId);

  const [method, setMethod] = useState<CheckoutMethod>('cod');
  const [placing, setPlacing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const preview = usePreview(address?.id ?? null, couponCode, method);

  // Pay-online is offered when the server has a live gateway (or the build flag forces it on).
  const onlineOffered = env.onlinePaymentEnabled || preview.data?.onlinePayment === true;

  // Correct an unavailable preselection once the preview tells us what's offered.
  if (preview.isSuccess && method === 'cod' && !preview.data.codEnabled) {
    const next = preselectMethod(availableMethods(false, onlineOffered));
    if (next && next !== method) setMethod(next);
  }

  const methods = preview.data ? availableMethods(preview.data.codEnabled, onlineOffered) : [];

  usePreventRemove(placing, () => {
    toast.show({ message: 'Placing your order…', tone: 'info' });
  });

  const activeLines = (cart.data?.items ?? []).filter((l) => !l.savedForLater);

  function resetToConfirmation(params: { orderId: string; provider: string; notice?: 'payment_unavailable' | 'payment_unavailable_cancel_failed' | 'payment_incomplete' }) {
    navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'OrderConfirmation', params }] });
  }

  async function place() {
    if (!address) return;
    setErrorMsg(null);
    setPlacing(true);
    try {
      const fingerprint = await computeFingerprint({
        addressId: address.id,
        paymentMethod: method,
        couponCode,
        lines: activeLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      const key = await getOrCreateAttempt(fingerprint);

      let result;
      try {
        result = await placeOrder(key, { addressId: address.id, paymentMethod: method, couponCode: couponCode ?? undefined });
      } catch (e) {
        const err = toApiError(e);
        const ambiguous = err.kind === 'network' || err.kind === 'timeout' || (err.kind === 'http' && err.status >= 500);
        if (ambiguous) {
          setErrorMsg(AMBIGUOUS_COPY); // keep the key for a safe retry
          return;
        }
        await settleAttempt('definitive');
        setErrorMsg(userMessage(err) || 'Could not place the order.');
        return;
      }

      await settleAttempt('definitive');
      void queryClient.invalidateQueries({ queryKey: qk.cart('customer') });
      void queryClient.invalidateQueries({ queryKey: qk.orders });
      setCouponCode(null);

      if (result.payment.provider === 'cod') {
        resetToConfirmation({ orderId: result.orderId, provider: 'cod' });
        return;
      }
      const adapter = getPaymentAdapter(result.payment.provider);
      const outcome = await adapter.pay({
        orderId: result.orderId,
        amount: result.payment.amount,
        clientConfig: result.payment.clientConfig,
        prefill: { name: customer?.name, contact: customer?.phone ?? undefined, email: customer?.email ?? undefined },
      });
      const params = await handlePaymentOutcome(outcome, {
        orderId: result.orderId,
        provider: result.payment.provider,
        cancelOrder,
      });
      resetToConfirmation(params);
    } finally {
      setPlacing(false);
    }
  }

  if (addressesQuery.isLoading) {
    return (
      <Screen padded>
        <Text style={styles.muted}>Loading…</Text>
      </Screen>
    );
  }
  if (addresses.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="map-marker-plus-outline"
          title="Add a delivery address"
          body="We need an address to deliver your order."
          action={{ label: 'Add address', onPress: () => navigation.navigate('AddressForm', { selectForCheckout: true }) }}
        />
      </Screen>
    );
  }

  const noMethod = preview.isSuccess && methods.length === 0;
  const view = preview.data ? breakupView(snapshotFromBreakup(preview.data.breakup)) : null;
  const shipping = view ? (view.rows.find((r) => r.key === 'shipping')?.amount ?? 0) : null;
  const canPlace =
    Boolean(address) && methods.length > 0 && preview.isSuccess && Boolean(preview.data?.serviceable) && !placing;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>Delivery Address</Text>
        {address ? (
          <View style={styles.card}>
            <View style={styles.addrRow}>
              <MaterialCommunityIcons name="account-outline" size={22} color={theme.colors.inkStrong} />
              <View style={styles.addrText}>
                <Text style={styles.addrName}>{address.fullName}</Text>
                {addressLines(address).map((l, i) => (
                  <Text key={i} style={styles.addrLine}>
                    {l}
                  </Text>
                ))}
                <Text style={styles.addrLine}>{address.phone}</Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('Addresses', { selectForCheckout: true })}
                accessibilityRole="button"
                accessibilityLabel="Change delivery address"
                hitSlop={8}
              >
                <Text style={styles.edit}>Edit</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>Delivery Method</Text>
        <View style={[styles.card, styles.methodCard]}>
          <View style={styles.radioOn}>
            <View style={styles.radioDot} />
          </View>
          <View style={styles.addrText}>
            <Text style={styles.methodTitle}>Standard Delivery</Text>
            <Text style={styles.addrLine}>Delivery in 3–5 days</Text>
          </View>
          <Text style={styles.methodPrice}>
            {shipping === null ? '' : shipping === 0 ? 'Free' : formatInr(shipping)}
          </Text>
        </View>

        <Text style={styles.section}>Payment Method</Text>
        {noMethod ? (
          <Text style={styles.banner}>No payment method is available right now. Please try again later.</Text>
        ) : (
          <View style={[styles.card, styles.methods]}>
            {methods.includes('upi') ? (
              <RadioRow
                label="UPI / Card / Net Banking"
                description="Pay online securely"
                selected={method === 'upi'}
                onPress={() => setMethod('upi')}
              />
            ) : null}
            {methods.includes('cod') ? (
              <RadioRow
                label="Cash on Delivery"
                description="Pay when your order arrives"
                selected={method === 'cod'}
                onPress={() => setMethod('cod')}
              />
            ) : null}
          </View>
        )}

        {preview.isError ? <ErrorState error={preview.error} onRetry={() => void preview.refetch()} /> : null}

        {preview.data && !preview.data.serviceable ? (
          <Text style={styles.banner}>This address is not serviceable. Choose another address.</Text>
        ) : null}

        {view ? (
          <View style={styles.summary}>
            <Text style={styles.section}>Price details</Text>
            {view.rows.map((r) => (
              <View key={r.key} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.amount < 0 ? `-${formatInr(-r.amount)}` : r.amount === 0 && r.key === 'shipping' ? 'FREE' : formatInr(r.amount)}</Text>
              </View>
            ))}
            <View style={[styles.row, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatInr(view.grandTotal)}</Text>
            </View>
            {view.gstNote ? <Text style={styles.gst}>{view.gstNote.label} {formatInr(view.gstNote.amount)}</Text> : null}
          </View>
        ) : null}

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <Button
          title={method === 'cod' ? 'Place Order' : 'Pay & Place Order'}
          fullWidth
          loading={placing}
          disabled={!canPlace}
          onPress={place}
          testID="place-order"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  section: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.inkStrong, marginTop: theme.spacing.md },
  // The Price details heading sits inside the summary card, which already has its own padding.
  methods: { paddingVertical: theme.spacing.xs },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  addrText: { flex: 1, gap: 2 },
  addrName: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '800' },
  addrLine: { ...theme.typography.caption, color: theme.colors.muted },
  edit: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '800' },
  methodCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  methodTitle: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  methodPrice: { ...theme.typography.body, color: theme.colors.brandStrong, fontWeight: '800' },
  radioOn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: theme.colors.primaryStrong },
  banner: { ...theme.typography.body, color: theme.colors.danger, backgroundColor: theme.colors.surface, padding: theme.spacing.md, borderRadius: theme.radius.md },
  summary: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { ...theme.typography.body, color: theme.colors.muted },
  rowValue: { ...theme.typography.body, color: theme.colors.ink },
  totalRow: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, marginTop: theme.spacing.xs },
  totalLabel: { ...theme.typography.title, color: theme.colors.inkStrong },
  totalValue: { ...theme.typography.title, color: theme.colors.inkStrong, fontWeight: '700' },
  gst: { ...theme.typography.caption, color: theme.colors.muted },
  error: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.md },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 14,
  },
});
