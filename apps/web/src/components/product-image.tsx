'use client';

import { useState } from 'react';
import { isUsableImageUrl } from '@/lib/category-theme';

/**
 * Renders a product image with a graceful fallback: if the real `src` is
 * missing, a non-shipped seed placeholder, or fails to load, it swaps to the
 * provided `fallback` (a generated dummy image). Keeps galleries and detail
 * pages from ever showing broken image icons.
 */
export function ProductImage({
  src,
  fallback,
  alt,
  className,
  testId,
}: {
  src: string | null;
  fallback: string;
  alt: string;
  className?: string;
  testId?: string;
}) {
  const [ok, setOk] = useState(isUsableImageUrl(src));
  const showReal = ok && isUsableImageUrl(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`${className ?? ''}${showReal ? '' : ' is-dummy'}`.trim()}
      src={showReal ? src : fallback}
      alt={alt}
      loading="lazy"
      onError={() => setOk(false)}
      data-testid={testId}
    />
  );
}
