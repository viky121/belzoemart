import { StyleSheet, Text, View } from 'react-native';

import type { CartLine } from '@/api/types';
import { theme } from '@/theme';
import { Button, PriceDisplay, QuantitySelector } from '@/ui';
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

/** A cart line (design §6.5): quantity control, save-for-later/move-to-cart, remove, line states. */
export function CartLineRow({ line, onPress }: CartLineRowProps) {
  const update = useUpdateQuantity();
  const remove = useRemoveLine();
  const save = useSaveForLater();
  const move = useMoveToCart();

  const busy = update.isPending || remove.isPending || save.isPending || move.isPending;
  const blockReason = lineBlockReason(line);
  const saved = line.savedForLater;

  return (
    <View style={styles.row}>
      <RemoteImage uri={line.imageUrl} width={72} height={72} radius={theme.radius.md} fallbackLabel={line.title} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2} onPress={onPress}>
          {line.title}
        </Text>
        {line.unit ? <Text style={styles.unit}>{line.unit}</Text> : null}
        <PriceDisplay price={line.unitPrice} mrp={line.mrp} size="sm" />
        {blockReason ? <Text style={styles.block}>{blockReason}</Text> : null}

        {!saved && !line.unavailable ? (
          <View style={styles.qtyRow}>
            <QuantitySelector
              value={line.quantity}
              min={1}
              max={99}
              busy={update.isPending}
              onChange={(next) => update.mutate({ variantId: line.variantId, quantity: next })}
              label={line.title}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
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
            <Button
              title="Save for later"
              variant="ghost"
              onPress={() => save.mutate(line.variantId)}
              loading={save.isPending}
              disabled={busy && !save.isPending}
            />
          ) : null}
          <Button
            title="Remove"
            variant="ghost"
            onPress={() => remove.mutate(line.variantId)}
            loading={remove.isPending}
            disabled={busy && !remove.isPending}
            testID={`cart-remove-${line.variantId}`}
          />
        </View>
      </View>
    </View>
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
  block: { ...theme.typography.caption, color: theme.colors.danger },
  qtyRow: { marginTop: theme.spacing.xs },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
});
