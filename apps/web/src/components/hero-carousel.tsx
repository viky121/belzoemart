'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { isUsableImageUrl, gradientFor } from '@/lib/category-theme';

export interface HeroSlide {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  background: string;
  /** Optional promo badge pill shown above the title. */
  badge?: string;
  /** When set, the slide renders this image (admin-managed banner) instead of
   *  the gradient + copy layout. */
  image?: string;
}

/** Decorative banner artwork (floating shapes + a sale bag), tinted white so it
 *  works over any gradient. Purely visual. */
function HeroArt() {
  return (
    <svg
      className="hero__art"
      viewBox="0 0 260 220"
      aria-hidden
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2">
        <circle cx="205" cy="45" r="20" />
        <circle cx="55" cy="55" r="10" />
        <circle cx="35" cy="150" r="7" />
      </g>
      <g opacity="0.9">
        <circle cx="205" cy="170" r="6" fill="rgba(255,255,255,0.6)" />
        <path d="M228 96l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="rgba(255,255,255,0.75)" />
        <path d="M40 96l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="rgba(255,255,255,0.55)" />
      </g>
      {/* Shopping bag */}
      <g transform="translate(96 60)">
        <path
          d="M8 34h64l-6 92a10 10 0 01-10 9H24a10 10 0 01-10-9z"
          fill="rgba(255,255,255,0.16)"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="3"
        />
        <path
          d="M24 40V30a16 16 0 0132 0v10"
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="40" cy="86" r="16" fill="#ffe11b" />
        <text
          x="40"
          y="92"
          textAnchor="middle"
          fontSize="17"
          fontWeight="800"
          fill="#1c2f6b"
          fontFamily="Segoe UI, Arial, sans-serif"
        >
          %
        </text>
      </g>
    </svg>
  );
}

/** Auto-rotating hero banner carousel for the storefront home. */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const count = slides.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count <= 1) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="hero" data-testid="home-hero" aria-roledescription="carousel">
      <div className="hero__track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((s, i) => {
          // Real, loadable banner image → show it edge to edge.
          if (s.image && isUsableImageUrl(s.image) && !broken[i]) {
            return (
              <Link key={i} href={s.href} className="hero__slide hero__slide--image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="hero__img"
                  src={s.image}
                  alt={s.title || 'Offer'}
                  onError={() => setBroken((b) => ({ ...b, [i]: true }))}
                />
              </Link>
            );
          }
          // Banner with a missing/broken image → themed gradient card with title.
          if (s.image) {
            return (
              <div key={i} className="hero__slide" style={{ background: gradientFor(s.title) }}>
                <div className="hero__copy">
                  <span className="hero__badge">🏷️ OFFER</span>
                  <h1>{s.title}</h1>
                  <Link href={s.href} className="hero__cta">
                    {s.cta}
                  </Link>
                </div>
                <HeroArt />
              </div>
            );
          }
          // Default styled gradient slide.
          return (
            <div key={i} className="hero__slide" style={{ background: s.background }}>
              <div className="hero__copy">
                {s.badge && <span className="hero__badge">{s.badge}</span>}
                <h1>{s.title}</h1>
                <p>{s.subtitle}</p>
                <Link href={s.href} className="hero__cta">
                  {s.cta}
                </Link>
              </div>
              <HeroArt />
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            className="hero__arrow hero__arrow--prev"
            onClick={() => go(index - 1)}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <button
            type="button"
            className="hero__arrow hero__arrow--next"
            onClick={() => go(index + 1)}
            aria-label="Next slide"
          >
            ›
          </button>
          <div className="hero__dots">
            {slides.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`hero__dot${i === index ? ' hero__dot--active' : ''}`}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
