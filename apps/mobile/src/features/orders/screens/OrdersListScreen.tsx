import { formatDate, formatInr, shortOrderId } from '@belzo/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Chip, EmptyState, ErrorState, Screen } from '@/ui';
import { OrderStatusBadge } from '@/ui/OrderStatusBadge';
import { RemoteImage } from '@/ui/RemoteImage';
import { ListSkeleton } from '@/ui/Skeleton';

import { useOrders } from '../hooks';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

function matchesFilter(status: string, key: FilterKey): boolean {
  switch (key) {
    case 'all':
      return true;
    case 'processing':
      return ['pending', 'confirmed', 'packed', 'processing'].includes(status);
    case 'shipped':
      return ['shipped', 'out_for_delivery'].includes(status);
    case 'delivered':
      return status === 'delivered';
  }
}

/** Orders list (design §11): status filter tabs + order cards with status badges. */
export function OrdersListScreen({ navigation }: RootScreenProps<'Orders'>) {
  const { data, isLoading, isError, error, refetch } = useOrders();
  const [filter, setFilter] = useState<FilterKey>('all');
  const orders = data ?? [];

  if (isLoading) {
    return (
      <Screen>
        <ListSkeleton rows={4} />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (orders.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="package-variant-closed"
          title="No orders yet"
          body="When you place an order, it will show up here."
          action={{ label: 'Start shopping', onPress: () => navigation.navigate('Main', { screen: 'HomeTab' }) }}
        />
      </Screen>
    );
  }

  const visible = orders.filter((o) => matchesFilter(o.status, filter));

  return (
    <Screen>
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {visible.length === 0 ? (
          <Text style={styles.emptyFilter}>No {filter === 'all' ? '' : filter} orders.</Text>
        ) : null}
        {visible.map((o) => {
          const thumbs = o.items.slice(0, 3);
          const extra = o.items.length - thumbs.length;
          return (
            <Pressable
              key={o.id}
              style={styles.card}
              onPress={() => navigation.navigate('OrderDetail', { id: o.id })}
              accessibilityRole="button"
              accessibilityLabel={`Order ${shortOrderId(o.id)}, ${o.status}, ${formatInr(o.grandTotal)}`}
            >
              <View style={styles.topRow}>
                <View style={styles.idCol}>
                  <Text style={styles.id}>Order #{shortOrderId(o.id)}</Text>
                  <Text style={styles.meta}>{formatDate(o.createdAt)}</Text>
                </View>
                <OrderStatusBadge status={o.status} />
              </View>

              <View style={styles.thumbs}>
                {thumbs.length > 0 ? (
                  thumbs.map((it, i) => (
                    <View key={`${it.title}-${i}`} style={styles.thumb}>
                      <RemoteImage uri={it.imageUrl ?? null} width={56} height={56} radius={theme.radius.sm} contentFit="contain" fallbackLabel={it.title} />
                    </View>
                  ))
                ) : (
                  <View style={styles.thumb}>
                    <RemoteImage uri={o.imageUrl ?? null} width={56} height={56} radius={theme.radius.sm} contentFit="contain" />
                  </View>
                )}
                {extra > 0 ? (
                  <View style={[styles.thumb, styles.more]}>
                    <Text style={styles.moreText}>+{extra}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.bottomRow}>
                <Text style={styles.total}>
                  {o.itemCount} Item{o.itemCount === 1 ? '' : 's'} • {formatInr(o.grandTotal)}
                </Text>
                <Text style={styles.details}>View Details ›</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabsWrap: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  tabs: { flexDirection: 'row', gap: theme.spacing.sm, padding: theme.spacing.md },
  emptyFilter: { ...theme.typography.body, color: theme.colors.muted, textAlign: 'center', paddingVertical: theme.spacing.xl },
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  card: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  idCol: { gap: 2, flex: 1 },
  id: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '800' },
  meta: { ...theme.typography.caption, color: theme.colors.muted },
  thumbs: { flexDirection: 'row', gap: theme.spacing.sm },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  more: { borderWidth: 1, borderColor: theme.colors.border },
  moreText: { ...theme.typography.body, color: theme.colors.muted, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  details: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
});
