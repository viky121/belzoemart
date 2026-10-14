'use client';

import { useRef } from 'react';
import Link from 'next/link';
import type { ProductCardDto } from '@belzo/shared';
import { ProductCard } from './product-card';

export interface RailPromo {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  background: string;
}

interface ProductRailProps {
  title: string;
  viewAllHref?: string;
  products: ProductCardDto[];
  promo?: RailPromo;
  testId?: string;
}

/** Horizontal product rail (Flipkart-style) with scroll arrows and an optional
 *  promotional lead panel. */
export function ProductRail({ title, viewAllHref, products, promo, testId }: ProductRailProps) {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 640, behavior: 'smooth' });
  };

  if (products.length === 0) return null;

  return (
    <section className="section-card home__section" data-testid={testId}>
      <div className="section-head">
        <h2>{title}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="section-head__view">
            VIEW ALL
          </Link>
        )}
      </div>

      <div className="rail">
        <button
          type="button"
          className="rail__arrow rail__arrow--prev"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
        >
          ‹
        </button>

        <div className="rail__scroller" ref={scroller}>
          {promo && (
            <Link href={promo.href} className="rail__promo" style={{ background: promo.background }}>
              <h3>{promo.title}</h3>
              <p>{promo.subtitle}</p>
              <span>{promo.cta}</span>
            </Link>
          )}
          {products.map((p) => (
            <div className="rail__item" key={p.id}>
              <ProductCard product={p} />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="rail__arrow rail__arrow--next"
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
        >
          ›
        </button>
      </div>
    </section>
  );
}
