'use client';

import { useEffect } from 'react';
import { trackViewItem } from '@/lib/tracking';

/** Tells Google Analytics / Meta Pixel that this product page was viewed (renders nothing). */
export function TrackViewItem({ id, name, price }: { id: string; name: string; price: number }) {
  useEffect(() => {
    trackViewItem({ id, name, price, quantity: 1 });
  }, [id, name, price]);
  return null;
}
