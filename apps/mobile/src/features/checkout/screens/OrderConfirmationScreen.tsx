import { formatInr, shortOrderId } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { qk } from '@/api/query-keys';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Screen } from '@/ui';

import { fetchOrder, type ConfirmationOrder } from '../api';
import { resolveOrderResultView, type OrderResultView } from '../order-result';

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
      return { icon: 'clock-outline', tone: theme.colors.primaryStrong, title: 'Confirming your payment…', body: "We're waiting for the gateway to confirm. This usually takes a few seconds." };
    case 'failed':
      return { icon: 'close-circle', tone: theme.colors.danger, title: 'Payment not completed', body: "Your order wasn't charged and has been cancelled. You can try again from your cart." };
    case 'notfound':
      return { icon: 'alert-circle-outline', tone: theme.colors.danger, title: 'Order not found', body: "We couldn't find that order." };
  }
}

/** Order confirmation (design §6.8): polls while awaiting the payment webhook, up to 12 times. */
export function OrderConfirmationScreen({ navigation, route }: RootScreenProps<'OrderConfirmation'>) {
  const { orderId, provider, notice } = route.params;
  const queryClient = useQueryClient();

  const query = useQuery<ConfirmationOrder>({
    queryKey: qk.order(orderId),
    queryFn: () => fetchOrder(orderId),
    refetchInterval: (q) => {
      const v = resolveOrderResultView(q.state.data ?? null, provider);
      return v === 'awaiting' && q.state.dataUpdateCount < MAX_POLLS ? 2500 : false;
    },
  });

  const order = query.data ?? null;
  const view = query.isError ? 'notfound' : query.isSuccess ? resolveOrderResultView(order, provider) : 'awaiting';
  const updateCount = queryClient.getQueryState(qk.order(orderId))?.dataUpdateCount ?? 0;
  const stuck = view === 'awaiting' && updateCount >= MAX_POLLS;
  const copy = stuck
    ? { icon: 'clock-outline' as const, tone: theme.colors.orange, title: 'Payment is still processing', body: 'If money was debited, your order will confirm automatically once the gateway notifies us. Check its status in your orders.' }
    : copyFor(view, notice, order);

  return (
    <Screen padded scroll>
      <View style={styles.card}>
        {view === 'awaiting' && !stuck ? (
          <ActivityIndicator size="large" color={theme.colors.primaryStrong} />
        ) : (
          <MaterialCommunityIcons name={copy.icon} size={64} color={copy.tone} />
        )}
        <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>

        <View style={styles.actions}>
          {view !== 'notfound' ? (
            <Button title="View order" fullWidth onPress={() => navigation.navigate('OrderDetail', { id: orderId })} testID="confirm-view-order" />
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
