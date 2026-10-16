import { formatInr } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody} testID="cart-scroll">
        {active.length > 0 ? (
          <View style={styles.freeDelivery}>
            <MaterialCommunityIcons
              name="truck-fast-outline"
              size={18}
              color={theme.colors.brandStrong}
            />
            <Text style={styles.freeDeliveryText}>Free delivery available on eligible orders</Text>
          </View>
        ) : null}

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

        {active.length > 0 ? (
          <View style={styles.priceCard}>
            <Text style={styles.priceTitle}>Price Details</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Item Total</Text>
              <Text style={styles.priceValue}>{formatInr(mrpTotal)}</Text>
            </View>
            {savings > 0 ? (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Discount</Text>
                <Text style={[styles.priceValue, styles.saveValue]}>-{formatInr(savings)}</Text>
              </View>
            ) : null}
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Delivery Charges</Text>
              <Text style={styles.priceValue}>At checkout</Text>
            </View>
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>{formatInr(subtotal)}</Text>
            </View>
            {savings > 0 ? (
              <Text style={styles.savings}>You save {formatInr(savings)} on this order</Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.note}>GST is included; final delivery charges are shown at checkout.</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <Button
          title="Proceed to Checkout"
          fullWidth
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
  scrollBody: { paddingTop: theme.spacing.md },
  priceCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    gap: theme.spacing.sm,
  },
  priceTitle: { ...theme.typography.bodyLg, fontWeight: '800', color: theme.colors.inkStrong },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel: { ...theme.typography.body, color: theme.colors.muted },
  priceValue: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '600' },
  saveValue: { color: theme.colors.brandStrong },
  totalRow: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm },
  totalLabel: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.inkStrong },
  totalValue: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: theme.colors.inkStrong },
  freeDelivery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.lg,
  },
  freeDeliveryText: {
    ...theme.typography.body,
    color: theme.colors.brandStrong,
    fontWeight: '700',
  },
  slabHint: { ...theme.typography.caption, color: theme.colors.muted, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  sectionTitle: { ...theme.typography.title, color: theme.colors.inkStrong, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },
  note: { ...theme.typography.caption, color: theme.colors.muted, padding: theme.spacing.lg },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  savings: { ...theme.typography.caption, color: theme.colors.brandStrong, fontWeight: '700' },
  checkout: { minHeight: 50 },
  blockedNote: { position: 'absolute', alignSelf: 'center', ...theme.typography.caption, color: theme.colors.danger },
});
