'use client';

import { useRef } from 'react';
import Link from 'next/link';

interface Brand {
  id: string;
  name: string;
  logoUrl?: string | null;
}

/** Top Brands horizontal carousel with scroll arrows (matches home mockup). */
export function BrandsRail({ brands }: { brands: Brand[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className="em-brands-wrap">
      <button
        type="button"
        className="em-brands-arrow em-brands-arrow--prev"
        onClick={() => scroll(-1)}
        aria-label="Previous brands"
      >
        ‹
      </button>
      <div className="em-brands" data-testid="emart-brands" ref={ref}>
        {brands.map((b) => (
          <Link key={b.id} href={`/search?brandId=${b.id}`} className="em-brand-chip">
            {b.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoUrl} alt={b.name} />
            ) : (
              <span>{b.name}</span>
            )}
          </Link>
        ))}
      </div>
      <button
        type="button"
        className="em-brands-arrow em-brands-arrow--next"
        onClick={() => scroll(1)}
        aria-label="Next brands"
      >
        ›
      </button>
    </div>
  );
}
