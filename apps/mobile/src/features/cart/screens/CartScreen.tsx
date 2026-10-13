import { formatInr } from '@belzo/shared';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requireAuth } from '@/navigation/RequireAuth';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { CartLineRow, lineBlockReason } from '../components/CartLineRow';
import { CouponBox } from '../components/CouponBox';
import { useCart } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;

/** Cart tab (design §6.5, §11): items, saved-for-later, coupon, line states, sticky checkout. */
export function CartScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, error, refetch } = useCart();

  const items = data?.items ?? [];
  const active = items.filter((l) => !l.savedForLater);
  const saved = items.filter((l) => l.savedForLater);
  const subtotal = active.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const mrpTotal = active.reduce((n, l) => n + l.mrp * l.quantity, 0);
  const savings = Math.max(0, mrpTotal - subtotal);
  const blocked = active.some((l) => lineBlockReason(l) !== null);
  const hasSlabs = items.some((l) => l.priceSlabs.length > 0);

  const openProduct = (productId: string) =>
    navigation.navigate('ProductDetail', { idOrSlug: productId });

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
  if (active.length === 0 && saved.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          body="Add products to get started."
          action={{ label: 'Start shopping', onPress: () => navigation.navigate('Main', { screen: 'HomeTab' }) }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView style={styles.scroll} testID="cart-scroll">
        <Text style={styles.heading} accessibilityRole="header">
          My Cart
        </Text>

        {active.map((line) => (
          <CartLineRow key={line.id} line={line} onPress={() => openProduct(line.productId)} />
        ))}

        {hasSlabs ? (
          <Text style={styles.slabHint}>
            Bulk price applies on the total quantity of a product (all packs).
          </Text>
        ) : null}

        {active.length > 0 ? <CouponBox subtotal={subtotal} /> : null}

        {saved.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Saved for later</Text>
            {saved.map((line) => (
              <CartLineRow key={line.id} line={line} onPress={() => openProduct(line.productId)} />
            ))}
          </View>
        ) : null}

        <Text style={styles.note}>Final amount, delivery and GST are shown at checkout.</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <View style={styles.totals}>
          <Text style={styles.subtotal}>{formatInr(subtotal)}</Text>
          {savings > 0 ? <Text style={styles.savings}>You save {formatInr(savings)}</Text> : null}
        </View>
        <Button
          title="Checkout"
          style={styles.checkout}
          disabled={active.length === 0 || blocked}
          onPress={() => requireAuth(navigation, { name: 'Checkout' })}
          testID="cart-checkout"
        />
      </View>
      {blocked ? (
        <Text style={[styles.blockedNote, { bottom: insets.bottom + 64 }]}>
          Fix the highlighted items to continue.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  heading: { ...theme.typography.heading, color: theme.colors.inkStrong, padding: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  slabHint: { ...theme.typography.caption, color: theme.colors.muted, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  sectionTitle: { ...theme.typography.title, color: theme.colors.inkStrong, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },
  note: { ...theme.typography.caption, color: theme.colors.muted, padding: theme.spacing.lg },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  totals: { flex: 1 },
  subtotal: { ...theme.typography.title, color: theme.colors.inkStrong, fontWeight: '700' },
  savings: { ...theme.typography.caption, color: theme.colors.brandStrong },
  checkout: { minWidth: 140 },
  blockedNote: { position: 'absolute', alignSelf: 'center', ...theme.typography.caption, color: theme.colors.danger },
});
