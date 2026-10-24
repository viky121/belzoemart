import { formatInr } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CartLine } from '@/api/types';
import { theme } from '@/theme';
import { Button, CompactStepper } from '@/ui';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';

import { useMoveToCart, useRemoveLine, useSaveForLater, useUpdateQuantity } from '../hooks';

export interface CartLineRowProps {
  line: CartLine;
  onPress: () => void;
  /** Draw the divider under the row (off for the last row of a group). Default true. */
  divider?: boolean;
}

/** Returns the blocking reason for an active line, or null when it can be checked out. */
export function lineBlockReason(line: CartLine): string | null {
  if (line.unavailable) return 'No longer available';
  if (!line.inStock && line.available > 0) return `Only ${line.available} left — reduce quantity`;
  if (!line.inStock && line.available === 0) return 'Out of stock';
  return null;
}

/**
 * A flat cart row meant to live inside a grouped white card: image, title + unit,
 * line total (with struck MRP) and a filled "− 1 +" stepper. Stepping down never goes
 * below 1; the trash icon removes the line.
 */
export function CartLineRow({ line, onPress, divider = true }: CartLineRowProps) {
  const update = useUpdateQuantity();
  const remove = useRemoveLine();
  const save = useSaveForLater();
  const move = useMoveToCart();

  const busy = update.isPending || remove.isPending || save.isPending || move.isPending;
  const blockReason = lineBlockReason(line);
  const saved = line.savedForLater;
  const lineTotal = line.unitPrice * line.quantity;
  const lineMrp = line.mrp * line.quantity;
  const showMrp = line.mrp > line.unitPrice;

  return (
    <View style={[styles.row, divider && styles.divider, blockReason ? styles.blocked : null]}>
      <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={line.title}>
        <View style={styles.imgWrap}>
          <RemoteImage
            uri={line.imageUrl}
            width={68}
            height={68}
            radius={theme.radius.lg}
            contentFit="contain"
            fallbackLabel={line.title}
          />
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
        {blockReason ? <Text style={styles.block}>{blockReason}</Text> : null}

        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.price}>{formatInr(lineTotal)}</Text>
            {showMrp ? <Text style={styles.mrp}>{formatInr(lineMrp)}</Text> : null}
          </View>

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
            <CompactStepper
              value={line.quantity}
              min={1}
              max={99}
              busy={update.isPending}
              onChange={(next) => update.mutate({ variantId: line.variantId, quantity: next })}
              label={line.title}
            />
          ) : null}
        </View>

        {!saved && !line.unavailable ? (
          <Pressable
            onPress={() => save.mutate(line.variantId)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Save ${line.title} for later`}
            hitSlop={8}
            style={styles.saveBtn}
          >
            <Text style={styles.saveLink}>Save for later</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  blocked: { backgroundColor: theme.colors.dangerBg },
  imgWrap: { backgroundColor: '#f6f8fa', borderRadius: theme.radius.lg, padding: 3 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs },
  title: {
    ...theme.typography.body,
    color: theme.colors.inkStrong,
    fontWeight: '700',
    flex: 1,
    paddingTop: 2,
  },
  unit: { ...theme.typography.caption, color: theme.colors.muted },
  block: { ...theme.typography.caption, color: theme.colors.danger, fontWeight: '600' },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  price: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.price },
  mrp: {
    ...theme.typography.caption,
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  saveBtn: { alignSelf: 'flex-start', marginTop: theme.spacing.xs },
  saveLink: { fontSize: 12.5, lineHeight: 17, color: theme.colors.primaryStrong, fontWeight: '800' },
});
