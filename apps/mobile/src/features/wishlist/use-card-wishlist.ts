import type { ProductCardDto } from '@belzo/shared';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useCallback, useMemo } from 'react';

import type { RootStackParamList } from '@/navigation/types';
import { useSessionStore } from '@/store/session';

import { useToggleWishlist, useWishlist } from './hooks';

/**
 * Heart state + toggle for product cards (keyed by the card's default variant).
 * Guests are sent to sign in instead of toggling.
 */
export function useCardWishlist() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  const wishlist = useWishlist();
  const toggle = useToggleWishlist();

  const ids = useMemo(
    () => new Set((wishlist.data ?? []).map((w) => w.variantId)),
    [wishlist.data],
  );

  const isWishlisted = useCallback(
    (p: ProductCardDto) => Boolean(p.defaultVariantId && ids.has(p.defaultVariantId)),
    [ids],
  );

  const onToggle = useCallback(
    (p: ProductCardDto) => {
      if (!isCustomer) {
        navigation.navigate('Login');
        return;
      }
      if (!p.defaultVariantId) return;
      toggle.mutate({ variantId: p.defaultVariantId, wishlisted: ids.has(p.defaultVariantId) });
    },
    [isCustomer, navigation, toggle, ids],
  );

  return { isWishlisted, onToggle };
}
