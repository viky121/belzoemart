'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { loginHref } from '@/lib/auth-redirect';
import { formatInr } from '@/lib/catalogue-api';
import { placeholderImage, isUsableImageUrl } from '@/lib/category-theme';
import { cartApi } from '@/lib/cart-api';
import { AccountSidebar } from '@/components/account-sidebar';

interface WishlistItem {
  id: string;
  variantId: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  unit: string | null;
  mrp: number;
  sellingPrice: number;
  discountPct: number;
  inStock: boolean;
}

export default function WishlistPage() {
  const router = useRouter();
  const { accessToken, authFetch } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const w = await authFetch<WishlistItem[]>('/wishlist').catch(() => [] as WishlistItem[]);
    setItems(w);
  }, [authFetch]);

  useEffect(() => {
    if (!accessToken) {
      router.push(loginHref('/wishlist'));
      return;
    }
    void load();
  }, [accessToken, load, router]);

  async function remove(variantId: string) {
    setBusy(true);
    try {
      setItems(await authFetch<WishlistItem[]>(`/wishlist/${variantId}`, { method: 'DELETE' }));
    } finally {
      setBusy(false);
    }
  }

  async function addToCart(variantId: string) {
    setBusy(true);
    try {
      await cartApi.add(variantId, 1, accessToken ?? undefined);
      router.push('/cart');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="acctx" data-testid="wishlist-page">
      <AccountSidebar />
      <div className="acctx__main">
        <div className="wish__head">
          <h1>♥ My Wishlist ({items.length})</h1>
          <p>These are the products you have saved for later.</p>
        </div>

        {items.length === 0 ? (
          <p className="ord__empty" data-testid="wishlist-empty">
            Your wishlist is empty. <Link href="/">Explore products</Link>
          </p>
        ) : (
          <div className="wish__grid">
            {items.map((it) => {
              const real = isUsableImageUrl(it.imageUrl);
              return (
                <div key={it.id} className="wcard" data-testid={`wishlist-item-${it.variantId}`}>
                  <div className="wcard__img">
                    {it.discountPct > 0 && <span className="wcard__off">{it.discountPct}% OFF</span>}
                    <button
                      className="wcard__heart"
                      onClick={() => remove(it.variantId)}
                      disabled={busy}
                      data-testid={`wishlist-remove-${it.variantId}`}
                      aria-label="Remove from wishlist"
                    >
                      ♥
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={real ? it.imageUrl! : placeholderImage(it.title, it.variantId)} alt={it.title} />
                  </div>
                  <h3 className="wcard__title">{it.title}</h3>
                  {it.unit && <span className="wcard__unit">{it.unit}</span>}
                  <div className="wcard__price">
                    <span className="price">{formatInr(it.sellingPrice)}</span>
                    {it.discountPct > 0 && (
                      <>
                        <span className="mrp">{formatInr(it.mrp)}</span>
                        <span className="discount">{it.discountPct}% off</span>
                      </>
                    )}
                  </div>
                  <span className={`wcard__stock${it.inStock ? '' : ' wcard__stock--out'}`}>
                    {it.inStock ? '● In Stock' : '● Out of stock'}
                  </span>
                  <div className="wcard__actions">
                    {it.slug && (
                      <Link href={`/product/${it.slug}`} className="wcard__view">
                        View Details
                      </Link>
                    )}
                    <button
                      className="wcard__add"
                      onClick={() => addToCart(it.variantId)}
                      disabled={busy || !it.inStock}
                    >
                      🛒 Add to Cart
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
