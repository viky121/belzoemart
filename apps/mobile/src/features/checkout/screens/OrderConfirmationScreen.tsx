import { formatInr, shortOrderId } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { qk } from '@/api/query-keys';
import { getPaymentAdapter } from '@/features/payments/registry';
import { syncPayment } from '@/features/payments/razorpay-adapter';
import type { RootScreenProps } from '@/navigation/types';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { Button, Screen } from '@/ui';

import { cancelOrder, fetchOrder, type ConfirmationOrder } from '../api';
import { resolveOrderResultView, type OrderResultView } from '../order-result';
import { handlePaymentOutcome } from '../payment-outcome';

const MAX_POLLS = 12;

interface Copy {
  icon: 'check-circle' | 'clock-outline' | 'close-circle' | 'alert-circle-outline';
  tone: string;
  title: string;
  body: string;
}

function copyFor(view: OrderResultView, notice: string | undefined, order: ConfirmationOrder | null): Copy {
  if (notice === 'payment_unavailable') {
    return {
      icon: 'alert-circle-outline',
      tone: theme.colors.orange,
      title: 'Order not placed',
      body: "Online payment isn't available in this app version yet. We cancelled this order and no money was taken. Please place it again with Cash on Delivery.",
    };
  }
  if (notice === 'payment_unavailable_cancel_failed') {
    return {
      icon: 'alert-circle-outline',
      tone: theme.colors.danger,
      title: 'Something went wrong',
      body: order ? `We couldn't complete this order. Please contact support with order #${shortOrderId(order.id)}.` : "We couldn't complete this order. Please contact support.",
    };
  }
  const total = order ? ` — ${formatInr(order.grandTotal)}` : '';
  switch (view) {
    case 'confirmed':
      return { icon: 'check-circle', tone: theme.colors.brandStrong, title: 'Payment successful', body: `Your order is confirmed${total}. A confirmation and invoice are on their way.` };
    case 'cod':
      return { icon: 'check-circle', tone: theme.colors.brandStrong, title: 'Order placed', body: `Your Cash on Delivery order is confirmed${order ? ` — pay ${formatInr(order.grandTotal)} on delivery` : ''}.` };
    case 'awaiting':
      if (notice === 'payment_incomplete') {
        return {
          icon: 'clock-outline',
          tone: theme.colors.orange,
          title: 'Payment not completed',
          body: `Your order is saved${total} but not paid yet. Pay now to confirm it. Unpaid orders are cancelled automatically after about 30 minutes.`,
        };
      }
      return { icon: 'clock-outline', tone: theme.colors.primaryStrong, title: 'Confirming your payment…', body: "We're checking with the payment gateway. This usually takes a few seconds." };
    case 'failed':
      return { icon: 'close-circle', tone: theme.colors.danger, title: 'Payment not completed', body: "This order was cancelled and no money was kept. You can try again from your cart." };
    case 'notfound':
      return { icon: 'alert-circle-outline', tone: theme.colors.danger, title: 'Order not found', body: "We couldn't find that order." };
  }
}

/**
 * Order confirmation (design §6.8). While an online payment is unconfirmed it asks the
 * server to check with the gateway on every poll (up to 12 times); if the customer left
 * the payment half-way it offers Pay now / Cancel order instead of leaving them stuck.
 */
export function OrderConfirmationScreen({ navigation, route }: RootScreenProps<'OrderConfirmation'>) {
  const { orderId, provider, notice } = route.params;
  const queryClient = useQueryClient();
  const customer = useSessionStore((s) => s.customer);
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);

  const query = useQuery<ConfirmationOrder>({
    queryKey: qk.order(orderId),
    queryFn: async () => {
      // Confirms the order with the gateway if it was paid (works before the webhook arrives).
      if (provider !== 'cod') await syncPayment(orderId);
      return fetchOrder(orderId);
    },
    refetchInterval: (q) => {
      const v = resolveOrderResultView(q.state.data ?? null, provider);
      const idle = route.params.notice === 'payment_incomplete';
      return v === 'awaiting' && !idle && q.state.dataUpdateCount < MAX_POLLS ? 2500 : false;
    },
  });

  const order = query.data ?? null;
  const view = query.isError ? 'notfound' : query.isSuccess ? resolveOrderResultView(order, provider) : 'awaiting';
  const updateCount = queryClient.getQueryState(qk.order(orderId))?.dataUpdateCount ?? 0;
  const stuck = view === 'awaiting' && notice !== 'payment_incomplete' && updateCount >= MAX_POLLS;
  const canPayAgain = view === 'awaiting' && (notice === 'payment_incomplete' || stuck) && provider !== 'cod';
  const copy = stuck
    ? { icon: 'clock-outline' as const, tone: theme.colors.orange, title: 'Payment is still processing', body: 'If money was debited, your order will confirm automatically once the gateway confirms it. You can also try paying again.' }
    : copyFor(view, notice, order);

  async function payAgain() {
    if (!order) return;
    setBusy('pay');
    try {
      const outcome = await getPaymentAdapter(provider).pay({
        orderId,
        amount: order.grandTotal,
        prefill: { name: customer?.name, contact: customer?.phone ?? undefined, email: customer?.email ?? undefined },
      });
      const params = await handlePaymentOutcome(outcome, { orderId, provider, cancelOrder });
      navigation.setParams({ notice: params.notice });
      await queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
      void queryClient.invalidateQueries({ queryKey: qk.orders });
    } finally {
      setBusy(null);
    }
  }

  async function cancelUnpaid() {
    setBusy('cancel');
    try {
      await cancelOrder(orderId, 'Cancelled before payment');
    } catch {
      /* the refetch below shows the real state */
    }
    navigation.setParams({ notice: undefined });
    await queryClient.invalidateQueries({ queryKey: qk.order(orderId) });
    void queryClient.invalidateQueries({ queryKey: qk.orders });
    setBusy(null);
  }

  return (
    <Screen padded scroll>
      <View style={styles.card}>
        {view === 'awaiting' && !stuck && notice !== 'payment_incomplete' ? (
          <ActivityIndicator size="large" color={theme.colors.primaryStrong} />
        ) : (
          <MaterialCommunityIcons name={copy.icon} size={64} color={copy.tone} />
        )}
        <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        <View style={styles.actions}>
          {canPayAgain ? (
            <Button
              title="Pay now"
              fullWidth
              loading={busy === 'pay'}
              disabled={busy !== null}
              onPress={payAgain}
              testID="confirm-pay-now"
            />
          ) : null}
          {view !== 'notfound' ? (
            <Button
              title="View order"
              variant={canPayAgain ? 'secondary' : 'primary'}
              fullWidth
              onPress={() => navigation.navigate('OrderDetail', { id: orderId })}
              testID="confirm-view-order"
            />
          ) : null}
          {canPayAgain ? (
            <Button
              title="Cancel order"
              variant="secondary"
              fullWidth
              loading={busy === 'cancel'}
              disabled={busy !== null}
              onPress={cancelUnpaid}
              testID="confirm-cancel-order"
            />
          ) : null}
          <Button
            title="Continue shopping"
            variant="secondary"
            fullWidth
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'HomeTab' } }] })}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xl },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong, textAlign: 'center' },
  body: { ...theme.typography.body, color: theme.colors.muted, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
});
