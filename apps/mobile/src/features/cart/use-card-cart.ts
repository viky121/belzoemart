import type { ProductCardDto } from '@belzo/shared';
import { useCallback, useMemo } from 'react';

import { useAddToCart, useCart, useRemoveLine, useUpdateQuantity } from './hooks';

const MAX_QTY = 99;

/** Props a ProductCard needs to show Add / quantity stepper for one product. */
export interface CardCartProps {
  quantity: number;
  onAdd: () => void;
  onChangeQuantity: (next: number) => void;
  adding: boolean;
}

export interface CardCart {
  /** Spread onto <ProductCard {...cart.cardProps(item)} />. */
  cardProps: (p: ProductCardDto) => CardCartProps;
  /** Active (not saved-for-later) units in the cart. */
  totalUnits: number;
}

/**
 * Cart state for product cards (keyed by the card's default variant), like useCardWishlist.
 * Add creates the line, the stepper updates it, and stepping down from 1 removes it.
 */
export function useCardCart(): CardCart {
  const cart = useCart();
  const add = useAddToCart();
  const update = useUpdateQuantity();
  const remove = useRemoveLine();

  const qtyByVariant = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart.data?.items ?? []) {
      if (!l.savedForLater) m.set(l.variantId, l.quantity);
    }
    return m;
  }, [cart.data]);

  const totalUnits = useMemo(
    () => Array.from(qtyByVariant.values()).reduce((n, q) => n + q, 0),
    [qtyByVariant],
  );

  const pendingVariant = add.isPending
    ? add.variables?.variantId
    : update.isPending
      ? update.variables?.variantId
      : remove.isPending
        ? remove.variables
        : undefined;

  const setQty = useCallback(
    (variantId: string, next: number) => {
      const current = qtyByVariant.get(variantId) ?? 0;
      const clamped = Math.min(MAX_QTY, Math.max(0, next));
      if (clamped === current) return;
      if (clamped === 0) remove.mutate(variantId);
      else if (current === 0) add.mutate({ variantId, quantity: clamped, silent: true });
      else update.mutate({ variantId, quantity: clamped });
    },
    [qtyByVariant, add, update, remove],
  );

  const cardProps = useCallback(
    (p: ProductCardDto): CardCartProps => {
      const variantId = p.defaultVariantId ?? '';
      return {
        quantity: variantId ? (qtyByVariant.get(variantId) ?? 0) : 0,
        onAdd: () => variantId && setQty(variantId, 1),
        onChangeQuantity: (next) => variantId && setQty(variantId, next),
        adding: Boolean(variantId) && pendingVariant === variantId,
      };
    },
    [qtyByVariant, setQty, pendingVariant],
  );

  return { cardProps, totalUnits };
}
