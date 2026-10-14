'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { cartApi } from '@/lib/cart-api';

/** Header cart link with a live item-count badge (updates on add/update/remove). */
export function CartLink() {
  const { accessToken } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ count: number }>).detail;
      if (detail && typeof detail.count === 'number') setCount(detail.count);
    };
    window.addEventListener('belzo:cart', onChange);
    // Initial load — emits a 'belzo:cart' event that the listener above catches.
    void cartApi.get(accessToken ?? undefined).catch(() => undefined);
    return () => window.removeEventListener('belzo:cart', onChange);
  }, [accessToken]);

  return (
    <Link href="/cart" className="em-cart" data-testid="nav-cart">
      <span className="em-actions__ic em-cart__wrap">
        🛒
        {count > 0 && (
          <span className="em-cart__badge" data-testid="cart-count">
            {count}
          </span>
        )}
      </span>
      <span>Cart</span>
    </Link>
  );
}
