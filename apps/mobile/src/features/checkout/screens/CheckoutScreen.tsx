import { breakupView, formatInr, snapshotFromBreakup } from '@belzo/shared';
import { usePreventRemove } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { AddressCard, Button, EmptyState, ErrorState, Screen } from '@/ui';
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

  // Correct an unavailable preselection once the preview tells us what's offered.
  if (preview.isSuccess && method === 'cod' && !preview.data.codEnabled) {
    const next = preselectMethod(availableMethods(false, env.onlinePaymentEnabled));
    if (next && next !== method) setMethod(next);
  }

  const methods = preview.data
    ? availableMethods(preview.data.codEnabled, env.onlinePaymentEnabled)
    : [];

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
  const canPlace =
    Boolean(address) && methods.length > 0 && preview.isSuccess && Boolean(preview.data?.serviceable) && !placing;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>Delivery address</Text>
        {address ? (
          <AddressCard
            address={address}
            actions={
              <Button title="Change" variant="ghost" onPress={() => navigation.navigate('Addresses', { selectForCheckout: true })} />
            }
          />
        ) : null}

        <Text style={styles.section}>Payment method</Text>
        {noMethod ? (
          <Text style={styles.banner}>No payment method is available right now. Please try again later.</Text>
        ) : (
          <View style={styles.methods}>
            {methods.includes('cod') ? (
              <Button title="Cash on Delivery" variant={method === 'cod' ? 'primary' : 'secondary'} onPress={() => setMethod('cod')} testID="method-cod" />
            ) : null}
            {methods.includes('upi') ? (
              <Button title="UPI / Card / Netbanking" variant={method === 'upi' ? 'primary' : 'secondary'} onPress={() => setMethod('upi')} testID="method-upi" />
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
          title={method === 'cod' ? 'Place order' : 'Pay & place order'}
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
  section: { ...theme.typography.title, color: theme.colors.inkStrong, marginTop: theme.spacing.md },
  methods: { gap: theme.spacing.sm },
  banner: { ...theme.typography.body, color: theme.colors.danger, backgroundColor: theme.colors.surface, padding: theme.spacing.md, borderRadius: theme.radius.md },
  summary: { marginTop: theme.spacing.md, gap: theme.spacing.xs },
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
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
});
