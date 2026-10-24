import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WishlistItem } from '@/api/types';
import { useAddToCart } from '@/features/cart/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, EmptyState, ErrorState, PriceDisplay, Screen } from '@/ui';
import { RemoteImage } from '@/ui/RemoteImage';
import { ListSkeleton } from '@/ui/Skeleton';

import { useToggleWishlist, useWishlist } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;

function WishlistRow({ item, onOpen }: { item: WishlistItem; onOpen: () => void }) {
  const add = useAddToCart();
  const toggle = useToggleWishlist();
  return (
    <View style={styles.row}>
      <RemoteImage uri={item.imageUrl} width={72} height={72} radius={theme.radius.md} fallbackLabel={item.title} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2} onPress={onOpen}>
          {item.title}
        </Text>
        {item.unit ? <Text style={styles.unit}>{item.unit}</Text> : null}
        <PriceDisplay price={item.sellingPrice} mrp={item.mrp} size="sm" />
        <View style={styles.actions}>
          <Button
            title="Add to cart"
            variant="secondary"
            icon="cart-plus"
            loading={add.isPending}
            disabled={!item.inStock}
            onPress={() => add.mutate({ variantId: item.variantId })}
            testID={`wishlist-add-${item.variantId}`}
          />
          <Button
            title="Remove"
            variant="ghost"
            loading={toggle.isPending}
            onPress={() => toggle.mutate({ variantId: item.variantId, wishlisted: true })}
            testID={`wishlist-remove-${item.variantId}`}
          />
        </View>
        {!item.inStock ? <Text style={styles.oos}>Out of stock</Text> : null}
      </View>
    </View>
  );
}

/** Wishlist (design §11): per-variant list; Add keeps the item wishlisted; Remove is explicit. */
export function WishlistScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isError, error, refetch } = useWishlist();
  const items = data ?? [];

  if (isLoading) {
    return (
      <Screen>
        <ListSkeleton rows={5} />
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
  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="heart-outline"
          title="Your wishlist is empty"
          body="Tap the heart on a product to save it here."
          action={{ label: 'Browse products', onPress: () => navigation.navigate('Main', { screen: 'HomeTab' }) }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView>
        {items.map((item) => (
          <WishlistRow
            key={item.id}
            item={item}
            onOpen={() => navigation.navigate('ProductDetail', { idOrSlug: item.slug })}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  info: { flex: 1, gap: theme.spacing.xs },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  unit: { ...theme.typography.caption, color: theme.colors.muted },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  oos: { ...theme.typography.caption, color: theme.colors.danger },
});
