'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ProductCardDto } from '@belzo/shared';
import { formatInr } from '@/lib/catalogue-api';
import { placeholderImage, isUsableImageUrl } from '@/lib/category-theme';
import { cartApi, toast } from '@/lib/cart-api';
import { useAuth } from '@/lib/auth-context';

/** Storefront product card used in listings, rails and search results. */
export function ProductCard({ product }: { product: ProductCardDto }) {
  const { accessToken, authFetch } = useAuth();
  const [imgOk, setImgOk] = useState(isUsableImageUrl(product.imageUrl));
  const [wished, setWished] = useState(false);
  const [qty, setQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const dummy = placeholderImage(product.title, product.slug);
  const showReal = imgOk && isUsableImageUrl(product.imageUrl);
  const variantId = product.defaultVariantId ?? null;
  // The admin's minimum order quantity: Add starts there, and stepping down from it removes the item.
  const minQty = product.minQty ?? 1;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  async function toggleWish(e: React.MouseEvent) {
    stop(e);
    const next = !wished;
    setWished(next); // optimistic
    // Persist for logged-in users; guests get a local (cosmetic) toggle.
    if (accessToken && variantId) {
      try {
        if (next) await authFetch('/wishlist', { method: 'POST', body: { variantId } });
        else await authFetch(`/wishlist/${variantId}`, { method: 'DELETE' });
      } catch {
        setWished(!next); // revert
      }
    }
  }

  async function setCartQty(e: React.MouseEvent, next: number) {
    stop(e);
    if (!variantId || busy) return;
    setBusy(true);
    const prev = qty;
    setQty(next); // optimistic
    try {
      if (next <= 0) await cartApi.remove(variantId, accessToken ?? undefined);
      else if (prev <= 0) await cartApi.add(variantId, next, accessToken ?? undefined);
      else await cartApi.update(variantId, next, accessToken ?? undefined);
    } catch (err) {
      setQty(prev); // revert on failure
      // Say why (e.g. the per-order maximum) instead of failing silently.
      toast(err instanceof Error && err.message ? err.message : 'Could not update your cart');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Link
      href={`/product/${product.slug}`}
      className="product-card"
      data-testid={`product-card-${product.slug}`}
    >
      <div className="product-card__image">
        {product.discountPct > 0 && (
          <span className="product-card__off">{product.discountPct}% OFF</span>
        )}
        <button
          type="button"
          className={`product-card__wish${wished ? ' product-card__wish--on' : ''}`}
          onClick={toggleWish}
          aria-pressed={wished}
          aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          {wished ? '♥' : '♡'}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={showReal ? '' : 'is-dummy'}
          src={showReal ? product.imageUrl! : dummy}
          alt={product.title}
          loading="lazy"
          onError={() => setImgOk(false)}
        />
      </div>

      <h3 className="product-card__title">{product.title}</h3>

      {product.unit && <div className="product-card__unit">{product.unit}</div>}

      {product.ratingCount > 0 && (
        <div className="product-card__rating">
          <span className="rating-pill">{product.ratingAvg.toFixed(1)} ★</span>
          <span>({product.ratingCount})</span>
        </div>
      )}

      <div className="product-card__price">
        <span className="price">{formatInr(product.sellingPrice)}</span>
        {product.discountPct > 0 && (
          <>
            <span className="mrp">{formatInr(product.mrp)}</span>
            <span className="discount">{product.discountPct}% off</span>
          </>
        )}
      </div>

      {/* Add to cart (shown in the eMart theme via CSS). */}
      {variantId && (
        <div className="product-card__cart">
          {qty <= 0 ? (
            <button
              type="button"
              className="product-card__add"
              onClick={(e) => setCartQty(e, minQty)}
              disabled={busy}
              data-testid={`card-add-${product.slug}`}
            >
              🛒 Add to Cart
            </button>
          ) : (
            <span className="product-card__stepper" data-testid={`card-stepper-${product.slug}`}>
              <button type="button" onClick={(e) => setCartQty(e, qty <= minQty ? 0 : qty - 1)} disabled={busy} aria-label="Decrease quantity">
                −
              </button>
              <span>{qty}</span>
              <button type="button" onClick={(e) => setCartQty(e, qty + 1)} disabled={busy} aria-label="Increase quantity">
                +
              </button>
            </span>
          )}
        </div>
      )}

      <div className="product-card__ship">Free delivery</div>
    </Link>
  );
}
