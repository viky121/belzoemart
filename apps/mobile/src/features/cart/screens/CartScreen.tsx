import { formatInr } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useBottomInset } from '@/lib/use-bottom-inset';
import { requireAuth } from '@/navigation/RequireAuth';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { CartLineRow, lineBlockReason } from '../components/CartLineRow';
import { CartOffers } from '../components/CartOffers';
import { CouponBox } from '../components/CouponBox';
import { useCart } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;

// The stack header already pads the top; only the sides (and the footer's own inset) are needed.
const EDGES = ['left', 'right'] as const;

/** Cart (design §6.5, §11): savings banner, grouped items, coupon, bill details, sticky total + checkout. */
export function CartScreen() {
  const navigation = useNavigation<Nav>();
  const bottomInset = useBottomInset();
  const { data, isLoading, isError, error, refetch } = useCart();

  const items = data?.items ?? [];
  const active = items.filter((l) => !l.savedForLater);
  const saved = items.filter((l) => l.savedForLater);
  const units = active.reduce((n, l) => n + l.quantity, 0);
  const subtotal = active.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  const mrpTotal = active.reduce((n, l) => n + l.mrp * l.quantity, 0);
  const savings = Math.max(0, mrpTotal - subtotal);
  const blocked = active.some((l) => lineBlockReason(l) !== null);
  const hasSlabs = items.some((l) => l.priceSlabs.length > 0);

  const openProduct = (productId: string) =>
    navigation.navigate('ProductDetail', { idOrSlug: productId });

  if (isLoading) {
    return (
      <Screen edges={[...EDGES]}>
        <ListSkeleton rows={4} />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={[...EDGES]}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (active.length === 0 && saved.length === 0) {
    return (
      <Screen edges={[...EDGES]}>
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
    <Screen edges={[...EDGES]} bottom="none">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
        testID="cart-scroll"
      >
        {savings > 0 ? (
          <View style={styles.savingsBanner} accessibilityRole="summary">
            <MaterialCommunityIcons name="tag-heart-outline" size={20} color={theme.colors.brandStrong} />
            <Text style={styles.savingsText}>
              You are saving <Text style={styles.savingsAmount}>{formatInr(savings)}</Text> on this order
            </Text>
          </View>
        ) : null}

        {active.length > 0 ? <CartOffers offers={data?.offers} /> : null}
        {active.length > 0 ? (
          <View style={styles.group}>
            <View style={styles.groupHead}>
              <MaterialCommunityIcons name="truck-fast-outline" size={18} color={theme.colors.brandStrong} />
              <Text style={styles.groupTitle} accessibilityRole="header">
                {units} {units === 1 ? 'item' : 'items'} in your cart
              </Text>
            </View>
            {active.map((line, i) => (
              <CartLineRow
                key={line.id}
                line={line}
                divider={i < active.length - 1}
                onPress={() => openProduct(line.productId)}
              />
            ))}
          </View>
        ) : null}

        {hasSlabs ? (
          <Text style={styles.slabHint}>
            Bulk price applies on the total quantity of a product (all packs).
          </Text>
        ) : null}

        {active.length > 0 ? <CouponBox subtotal={subtotal} /> : null}

        {saved.length > 0 ? (
          <View style={styles.group}>
            <View style={styles.groupHead}>
              <MaterialCommunityIcons name="bookmark-outline" size={18} color={theme.colors.muted} />
              <Text style={styles.groupTitle} accessibilityRole="header">
                Saved for later ({saved.length})
              </Text>
            </View>
            {saved.map((line, i) => (
              <CartLineRow
                key={line.id}
                line={line}
                divider={i < saved.length - 1}
                onPress={() => openProduct(line.productId)}
              />
            ))}
          </View>
        ) : null}

        {active.length > 0 ? (
          <View style={styles.priceCard}>
            <Text style={styles.priceTitle}>Bill details</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Item total</Text>
              <View style={styles.priceValueRow}>
                {savings > 0 ? <Text style={styles.strike}>{formatInr(mrpTotal)}</Text> : null}
                <Text style={styles.priceValue}>{formatInr(subtotal)}</Text>
              </View>
            </View>
            {savings > 0 ? (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Product discount</Text>
                <Text style={[styles.priceValue, styles.saveValue]}>-{formatInr(savings)}</Text>
              </View>
            ) : null}
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Delivery charges</Text>
              <Text style={styles.priceValue}>At checkout</Text>
            </View>
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>To pay</Text>
              <Text style={styles.totalValue}>{formatInr(subtotal)}</Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.note}>GST is included; final delivery charges are shown at checkout.</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomInset + theme.spacing.sm }]}>
        {blocked ? <Text style={styles.blockedNote}>Fix the highlighted items to continue.</Text> : null}
        <View style={styles.footerRow}>
          <View style={styles.footerTotal}>
            <Text style={styles.footerAmount} maxFontSizeMultiplier={theme.maxFontSizeMultiplier}>
              {formatInr(subtotal)}
            </Text>
            <Text style={styles.footerCaption}>TOTAL</Text>
          </View>
          <Button
            title="Proceed to Checkout"
            style={styles.checkout}
            disabled={active.length === 0 || blocked}
            onPress={() => requireAuth(navigation, { name: 'Checkout' })}
            testID="cart-checkout"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollBody: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xl },
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: '#cfe9dc',
  },
  savingsText: { ...theme.typography.body, flex: 1, color: theme.colors.brandStrong, fontWeight: '600' },
  savingsAmount: { fontWeight: '800' },
  group: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    backgroundColor: theme.colors.primaryBg,
  },
  groupTitle: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '800' },
  slabHint: {
    ...theme.typography.caption,
    color: theme.colors.muted,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  priceCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  priceTitle: { ...theme.typography.bodyLg, fontWeight: '800', color: theme.colors.inkStrong },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceValueRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  priceLabel: { ...theme.typography.body, color: theme.colors.muted },
  priceValue: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '600' },
  strike: { ...theme.typography.caption, color: theme.colors.muted, textDecorationLine: 'line-through' },
  saveValue: { color: theme.colors.brandStrong },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  totalLabel: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.inkStrong },
  totalValue: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: theme.colors.inkStrong },
  note: { ...theme.typography.caption, color: theme.colors.muted, padding: theme.spacing.lg },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 14,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  footerTotal: { minWidth: 84 },
  footerAmount: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: theme.colors.inkStrong },
  footerCaption: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: theme.colors.muted, letterSpacing: 0.5 },
  checkout: { flex: 1, minHeight: 50 },
  blockedNote: { ...theme.typography.caption, color: theme.colors.danger, textAlign: 'center' },
});
