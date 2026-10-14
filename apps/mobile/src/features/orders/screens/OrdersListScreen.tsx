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
          const first = o.items[0];
          const img = o.imageUrl ?? first?.imageUrl ?? null;
          return (
            <Pressable
              key={o.id}
              style={styles.row}
              onPress={() => navigation.navigate('OrderDetail', { id: o.id })}
              accessibilityRole="button"
              accessibilityLabel={`Order ${shortOrderId(o.id)}, ${o.status}`}
            >
              <RemoteImage uri={img} width={64} height={64} radius={theme.radius.md} fallbackLabel={first?.title} />
              <View style={styles.info}>
                <View style={styles.topRow}>
                  <Text style={styles.id}>{shortOrderId(o.id)}</Text>
                  <OrderStatusBadge status={o.status} />
                </View>
                <Text style={styles.meta}>{formatDate(o.createdAt)}</Text>
                <Text style={styles.meta}>
                  {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · {formatInr(o.grandTotal)}
                </Text>
                {first ? (
                  <Text style={styles.title} numberOfLines={1}>
                    {first.title}
                    {o.items.length > 1 ? ` +${o.items.length - 1} more` : ''}
                  </Text>
                ) : null}
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
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  info: { flex: 1, gap: 2 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  meta: { ...theme.typography.caption, color: theme.colors.muted },
  title: { ...theme.typography.body, color: theme.colors.ink },
});
