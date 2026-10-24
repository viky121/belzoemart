import { cartOfferCard, cartOffersToShow, type CartOffer } from '@belzo/shared';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { RemoteImage } from '@/ui/RemoteImage';
import { useAddToCart } from '../hooks';

/**
 * "Shop ₹2,000 and get Sugar 1 kg at ₹29": a progress bar while the offer is locked, an Add button once it is
 * unlocked, and a quiet note once the offer price is being charged. The server sets the price.
 */
export function CartOffers({ offers }: { offers: readonly CartOffer[] | undefined }) {
  const add = useAddToCart();
  const shown = cartOffersToShow(offers);
  if (shown.length === 0) return null;
  return (
    <View style={styles.wrap} testID="cart-offers">
      {shown.map((o) => {
        const card = cartOfferCard(o);
        return (
          <View key={card.offerId} style={[styles.card, card.kind === 'applied' && styles.applied, card.kind === 'add' && styles.ready]}>
            <RemoteImage uri={card.imageUrl} width={48} height={48} radius={theme.radius.lg} contentFit="contain" fallbackLabel={card.title} />
            <View style={styles.body}>
              <Text style={styles.title}>🎁 {card.headline}</Text>
              <Text style={styles.detail} testID={`cart-offer-detail-${card.offerId}`}>{card.detail}</Text>
              {card.kind === 'progress' ? (
                <View
                  style={styles.track}
                  accessibilityRole="progressbar"
                  accessibilityLabel={`Progress towards ${card.headline}`}
                  accessibilityValue={{ min: 0, max: 100, now: card.percent }}
                >
                  <View style={[styles.fill, { width: `${card.percent}%` }]} />
                </View>
              ) : null}
            </View>
            {card.kind === 'add' ? (
              <Button
                title="Add"
                onPress={() => add.mutate({ variantId: card.variantId, quantity: 1, silent: true })}
                loading={add.isPending}
                testID={`cart-offer-add-${card.offerId}`}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  applied: { borderStyle: 'solid', borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  ready: { borderStyle: 'solid', borderColor: '#2874f0', backgroundColor: '#eff6ff' },
  body: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '800' },
  detail: { ...theme.typography.caption, color: theme.colors.muted },
  track: { height: 8, borderRadius: 999, backgroundColor: '#fde68a', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 999, backgroundColor: '#f59e0b' },
});
