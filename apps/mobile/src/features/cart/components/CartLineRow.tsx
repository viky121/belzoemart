import { formatInr } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CartLine } from '@/api/types';
import { theme } from '@/theme';
import { Button, QuantitySelector } from '@/ui';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';

import { useMoveToCart, useRemoveLine, useSaveForLater, useUpdateQuantity } from '../hooks';

export interface CartLineRowProps {
  line: CartLine;
  onPress: () => void;
}

/** Returns the blocking reason for an active line, or null when it can be checked out. */
export function lineBlockReason(line: CartLine): string | null {
  if (line.unavailable) return 'No longer available';
  if (!line.inStock && line.available > 0) return `Only ${line.available} left — reduce quantity`;
  if (!line.inStock && line.available === 0) return 'Out of stock';
  return null;
}

/** A cart line card (Belzo Mart design): image, title, variant, price, stepper, trash. */
export function CartLineRow({ line, onPress }: CartLineRowProps) {
  const update = useUpdateQuantity();
  const remove = useRemoveLine();
  const save = useSaveForLater();
  const move = useMoveToCart();

  const busy = update.isPending || remove.isPending || save.isPending || move.isPending;
  const blockReason = lineBlockReason(line);
  const saved = line.savedForLater;
  const showMrp = line.mrp > line.unitPrice;

  return (
    <View style={[styles.card, blockReason ? styles.cardBlocked : null]}>
      <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={line.title}>
        <View style={styles.imgWrap}>
          <RemoteImage uri={line.imageUrl} width={84} height={84} radius={theme.radius.md} contentFit="contain" fallbackLabel={line.title} />
        </View>
      </Pressable>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2} onPress={onPress}>
            {line.title}
          </Text>
          <IconButton
            icon="trash-can-outline"
            label={`Remove ${line.title}`}
            color={theme.colors.muted}
            size={20}
            onPress={() => remove.mutate(line.variantId)}
            disabled={busy}
            testID={`cart-remove-${line.variantId}`}
          />
        </View>
        {line.unit ? <Text style={styles.unit}>{line.unit}</Text> : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatInr(line.unitPrice)}</Text>
          {showMrp ? <Text style={styles.mrp}>{formatInr(line.mrp)}</Text> : null}
        </View>
        {blockReason ? <Text style={styles.block}>{blockReason}</Text> : null}

        <View style={styles.bottomRow}>
          {!saved && !line.unavailable ? (
            <QuantitySelector
              value={line.quantity}
              min={1}
              max={99}
              busy={update.isPending}
              onChange={(next) => update.mutate({ variantId: line.variantId, quantity: next })}
              label={line.title}
            />
          ) : null}
          {saved ? (
            <Button
              title="Move to cart"
              variant="secondary"
              onPress={() => move.mutate(line.variantId)}
              loading={move.isPending}
              disabled={busy && !move.isPending}
              testID={`cart-move-${line.variantId}`}
            />
          ) : !line.unavailable ? (
            <Pressable
              onPress={() => save.mutate(line.variantId)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Save ${line.title} for later`}
              hitSlop={8}
            >
              <Text style={styles.saveLink}>Save for later</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  cardBlocked: { borderColor: theme.colors.danger },
  imgWrap: { backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md, padding: 4 },
  info: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700', flex: 1, paddingTop: 4 },
  unit: { ...theme.typography.caption, color: theme.colors.muted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 2 },
  price: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.price },
  mrp: { ...theme.typography.caption, color: theme.colors.muted, textDecorationLine: 'line-through' },
  block: { ...theme.typography.caption, color: theme.colors.danger },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  saveLink: { ...theme.typography.caption, color: theme.colors.primaryStrong, fontWeight: '700' },
});
