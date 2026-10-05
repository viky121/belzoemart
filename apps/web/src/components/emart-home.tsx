import Link from 'next/link';
import { catalogueApi } from '@/lib/catalogue-api';
import { ProductCard } from '@/components/product-card';
import { HeroCarousel, type HeroSlide } from '@/components/hero-carousel';
import { BrandsRail } from '@/components/brands-rail';
import { contentApi } from '@/lib/content-api';
import { iconFor, isUsableImageUrl } from '@/lib/category-theme';
import { getSiteContent } from '@/lib/site-content';
import { getHomeSections, resolveHomeSections } from '@/lib/home-sections';
import type { CategoryNodeDto } from '@belzo/shared';

/** Soft pastel promo cards (themed heading + "Shop Now" pill), as per mockup. */
const PROMO_BG: Record<string, string> = {
  green: 'linear-gradient(135deg, #e9f9ef 0%, #d7f3e1 100%)',
  pink: 'linear-gradient(135deg, #fdeaf3 0%, #fbd9e8 100%)',
  blue: 'linear-gradient(135deg, #eaf4ff 0%, #dcebfd 100%)',
  amber: 'linear-gradient(135deg, #fff3e0 0%, #ffe8cc 100%)',
};

/** eMart theme storefront home: grocery/FMCG look — content is admin-editable. */
export async function EmartHome() {
  const { home, sections } = await getSiteContent();
  const categories = await catalogueApi.categories().catch(() => [] as CategoryNodeDto[]);
  const brands = await catalogueApi.brands().catch(() => []);
  const banners = await contentApi.banners('home_hero').catch(() => []);

  const heroSlides: HeroSlide[] = banners.map((b) => ({
    title: b.title ?? 'Belzo eMart offer',
    subtitle: '',
    cta: 'Shop now',
    href: b.linkUrl || '/search?sort=discount',
    background: '#ffffff',
    image: b.imageUrl,
  }));

  const resolvedSections = await resolveHomeSections(getHomeSections(sections));

  const hero = home.hero;
  const promos = home.promos.map((p) => ({ ...p, background: PROMO_BG[p.color] ?? PROMO_BG.green }));

  return (
    <div className="em-home" data-testid="home-page">
      {/* Hero — admin-managed banner slider when banners exist, else the themed hero */}
      {heroSlides.length > 0 ? (
        <div className="em-hero-slider" data-testid="emart-hero">
          <HeroCarousel slides={heroSlides} />
        </div>
      ) : (
        <section className="em-hero" data-testid="emart-hero">
          <div className="em-hero__text">
            <p className="em-hero__eyebrow">{hero.eyebrow}</p>
            <h1>
              {hero.line1}
              <br />
              {hero.line2} <span className="em-hero__accent">{hero.accent}</span>
            </h1>
            <p className="em-hero__sub">{hero.subtitle}</p>
            <Link href={hero.ctaHref} className="em-hero__cta">
              {hero.ctaText} →
            </Link>
          </div>
          <div className="em-hero__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.imageUrl} alt="Fresh groceries and daily essentials" />
          </div>
        </section>
      )}

      {/* Shop by Category */}
      {categories.length > 0 && (
        <section className="em-section">
          <div className="em-section__head">
            <h2>Shop by Category</h2>
            <Link href="/search">View All Categories →</Link>
          </div>
          <div className="em-cats" data-testid="emart-categories">
            {categories.map((c, i) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="em-cat"
                data-tile={i % 8}
                data-testid={`emart-cat-${c.slug}`}
              >
                <span className={`em-cat__icon${isUsableImageUrl(c.imageUrl) ? ' em-cat__icon--img' : ''}`}>
                  {isUsableImageUrl(c.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl!} alt="" className="em-cat__img" />
                  ) : (
                    iconFor(c.slug)
                  )}
                </span>
                <span className="em-cat__name">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Promo banners */}
      <section className="em-promos" data-testid="emart-promos">
        {promos.map((p) => (
          <Link key={p.title} href={p.href} className="em-promo" data-accent={p.color} style={{ background: p.background }}>
            <div className="em-promo__body">
              <h3>{p.title}</h3>
              <p>{p.subtitle}</p>
              <span className="em-promo__cta">{p.cta} →</span>
            </div>
            <span className="em-promo__icon" aria-hidden="true">
              {p.icon}
            </span>
          </Link>
        ))}
      </section>

      {/* Admin-managed home sections (shared config, both themes) */}
      {resolvedSections.map((s) => (
        <section className="em-section" key={s.id}>
          <div className="em-section__head">
            <h2>{s.title}</h2>
            {s.viewAllHref && <Link href={s.viewAllHref}>View all →</Link>}
          </div>
          <div className="product-grid" data-testid={`home-section-${s.id}`}>
            {s.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ))}

      {/* Top Brands */}
      {brands.length > 0 && (
        <section className="em-section">
          <div className="em-section__head">
            <h2>Top Brands</h2>
          </div>
          <BrandsRail brands={brands} />
        </section>
      )}

      {/* Why Choose */}
      {home.why.length > 0 && (
        <section className="em-why" data-testid="emart-why">
          <h2>Why Choose Belzo E Mart?</h2>
          <div className="em-why__grid">
            {home.why.map((f, i) => (
              <div key={i} className="em-why__item">
                <span className="em-why__icon">{f.icon}</span>
                <strong>{f.title}</strong>
                <span>{f.sub}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
