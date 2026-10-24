import {
  breakupView,
  buildStepper,
  cancelEligibility,
  cancelUnavailableReason,
  formatDateTime,
  formatInr,
  resolutionLabel,
  returnEligibility,
  returnStatusLabel,
  shortOrderId,
  variantText,
} from '@belzo/shared';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { Button, Card, EmptyState, ErrorState, Screen } from '@/ui';
import { OrderStatusBadge } from '@/ui/OrderStatusBadge';
import { OrderStepper } from '@/ui/OrderStepper';
import { RemoteImage } from '@/ui/RemoteImage';
import { DetailSkeleton } from '@/ui/Skeleton';
import { useToast } from '@/ui/Toast';

import { fetchInvoice } from '../api';
import { CancelOrderModal } from '../components/CancelOrderModal';
import { ReturnRequestModal } from '../components/ReturnRequestModal';
import { TrackingTimeline } from '../components/TrackingTimeline';
import { useOrderDetail, useReorder } from '../hooks';

/** Order detail (design §11, §6.9): stepper, tracking, items, address, payment, breakup, returns, actions. */
export function OrderDetailScreen({ navigation, route }: RootScreenProps<'OrderDetail'>) {
  const { id } = route.params;
  const toast = useToast();
  const { data: order, isLoading, isError, error, refetch } = useOrderDetail(id);
  const reorder = useReorder();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  if (isLoading) {
    return (
      <Screen>
        <DetailSkeleton />
      </Screen>
    );
  }
  if (isError || !order) {
    return (
      <Screen>
        {!order && !isError ? (
          <EmptyState icon="package-variant" title="Order not found" />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}
      </Screen>
    );
  }

  const steps = buildStepper(order);
  const view = breakupView(order);
  const ret = returnEligibility(order);
  const canCancel = cancelEligibility(order);
  const cancelHint = cancelUnavailableReason(order);
  const payment = order.payments[0];

  async function openInvoice() {
    setInvoiceBusy(true);
    try {
      const inv = await fetchInvoice(id);
      await WebBrowser.openBrowserAsync(inv.url);
    } catch {
      toast.show({ message: 'Could not open the invoice. Please try again.', tone: 'error' });
    } finally {
      setInvoiceBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <View style={styles.headerRow}>
            <View style={styles.flex}>
              <Pressable
                onPress={() => {
                  void Clipboard.setStringAsync(order.id);
                  toast.show({ message: 'Order ID copied' });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Order ${shortOrderId(order.id)}. Tap to copy the full id`}
              >
                <Text style={styles.orderId}>{shortOrderId(order.id)}</Text>
              </Pressable>
              <Text style={styles.date}>Placed {formatDateTime(order.createdAt)}</Text>
            </View>
            <OrderStatusBadge status={order.status} />
          </View>
          {order.status === 'cancelled' && order.cancelledReason ? (
            <Text style={styles.cancelReason}>Cancelled: {order.cancelledReason}</Text>
          ) : null}
        </Card>

        <Section title="Progress">
          <OrderStepper steps={steps} />
        </Section>

        <Section title="Tracking">
          <TrackingTimeline tracking={order.tracking} />
        </Section>

        <Section title={`Items (${order.items.length})`}>
          {order.items.map((item) => {
            const vt = variantText(item.attributes);
            return (
              <Pressable
                key={item.id}
                style={styles.item}
                disabled={!item.slug}
                onPress={() => item.slug && navigation.navigate('ProductDetail', { idOrSlug: item.slug })}
              >
                <RemoteImage uri={item.imageUrl} width={56} height={56} radius={theme.radius.sm} fallbackLabel={item.title} />
                <View style={styles.flex}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                  {vt ? <Text style={styles.itemMeta}>{vt}</Text> : null}
                  <Text style={styles.itemMeta}>Qty {item.quantity} · {formatInr(item.unitPrice)}</Text>
                </View>
                <Text style={styles.itemTotal}>{formatInr(item.unitPrice * item.quantity)}</Text>
              </Pressable>
            );
          })}
        </Section>

        {order.address ? (
          <Section title="Delivery address">
            <Text style={styles.addr}>{order.address.fullName} · {order.address.phone}</Text>
            <Text style={styles.addr}>
              {[order.address.line1, order.address.line2, `${order.address.city}, ${order.address.state} ${order.address.pincode}`]
                .filter(Boolean)
                .join(', ')}
            </Text>
          </Section>
        ) : null}

        {payment ? (
          <Section title="Payment">
            <Text style={styles.addr}>
              {(payment.method ?? payment.provider).toUpperCase()} · {payment.status} · {formatInr(payment.amount)}
            </Text>
          </Section>
        ) : null}

        <Section title="Price details">
          {view.rows.map((r) => (
            <View key={r.key} style={styles.priceRow}>
              <Text style={styles.priceLabel}>{r.label}</Text>
              <Text style={styles.priceValue}>
                {r.amount < 0 ? `-${formatInr(-r.amount)}` : r.amount === 0 && r.key === 'shipping' ? 'FREE' : formatInr(r.amount)}
              </Text>
            </View>
          ))}
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatInr(view.grandTotal)}</Text>
          </View>
          {view.gstNote ? <Text style={styles.gst}>{view.gstNote.label} {formatInr(view.gstNote.amount)}</Text> : null}
        </Section>

        {order.returns.length > 0 ? (
          <Section title="Returns">
            {order.returns.map((r) => (
              <View key={r.id} style={styles.returnRow}>
                <Text style={styles.returnStatus}>{returnStatusLabel(r.status)} · {resolutionLabel(r.resolution)}</Text>
                <Text style={styles.itemMeta}>{r.reason}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        <View style={styles.actions}>
          {(order.invoiceUrl || order.invoice) ? (
            <Button title="Download invoice" variant="secondary" loading={invoiceBusy} onPress={openInvoice} />
          ) : null}
          {canCancel ? (
            <Button title="Cancel order" variant="danger" onPress={() => setCancelOpen(true)} testID="cancel-order" />
          ) : cancelHint ? (
            <Text style={styles.hint}>{cancelHint}</Text>
          ) : null}
          {ret.eligible ? (
            <Button title="Return items" variant="secondary" onPress={() => setReturnOpen(true)} testID="return-items" />
          ) : ret.reason ? (
            <Text style={styles.hint}>{ret.reason}</Text>
          ) : null}
          <Button
            title="Reorder"
            variant="ghost"
            loading={reorder.isPending}
            onPress={() =>
              reorder.mutate(id, {
                onSuccess: () => {
                  toast.show({ message: 'Items added to your cart' });
                  navigation.navigate('Cart');
                },
              })
            }
          />
        </View>
      </ScrollView>

      <CancelOrderModal order={order} visible={cancelOpen} onClose={() => setCancelOpen(false)} onDone={() => { setCancelOpen(false); toast.show({ message: 'Order cancelled' }); }} />
      <ReturnRequestModal order={order} visible={returnOpen} onClose={() => setReturnOpen(false)} onDone={() => { setReturnOpen(false); toast.show({ message: 'Return request submitted' }); }} />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const brand = useBrand();
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionBar, { backgroundColor: brand.active ? brand.accent : brand.primary }]} />
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: theme.spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.md },
  flex: { flex: 1 },
  orderId: { ...theme.typography.title, color: theme.colors.inkStrong, fontWeight: '700' },
  date: { ...theme.typography.caption, color: theme.colors.muted },
  cancelReason: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.sm },
  section: { gap: theme.spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  sectionBar: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.inkStrong },
  item: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' },
  itemTitle: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  itemMeta: { ...theme.typography.caption, color: theme.colors.muted },
  itemTotal: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '700' },
  addr: { ...theme.typography.body, color: theme.colors.ink },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel: { ...theme.typography.body, color: theme.colors.muted },
  priceValue: { ...theme.typography.body, color: theme.colors.ink },
  totalRow: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.xs, marginTop: theme.spacing.xs },
  totalLabel: { ...theme.typography.title, color: theme.colors.inkStrong },
  totalValue: { ...theme.typography.title, color: theme.colors.inkStrong, fontWeight: '700' },
  gst: { ...theme.typography.caption, color: theme.colors.muted },
  returnRow: { gap: 2 },
  returnStatus: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.lg, paddingHorizontal: theme.spacing.md },
  hint: { ...theme.typography.caption, color: theme.colors.muted },
});
