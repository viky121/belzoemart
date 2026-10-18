import Link from 'next/link';
import { catalogueApi, type Paginated } from '@/lib/catalogue-api';
import { HeroCarousel, type HeroSlide } from '@/components/hero-carousel';
import { ProductRail } from '@/components/product-rail';
import { gradientFor } from '@/lib/category-theme';
import { contentApi } from '@/lib/content-api';
import { getTheme } from '@/lib/theme';
import { getSiteContent, type PromoContent } from '@/lib/site-content';
import { getHomeSections, resolveHomeSections } from '@/lib/home-sections';
import { isUsableImageUrl } from '@/lib/category-theme';
import { EmartHome } from '@/components/emart-home';
import { OfferRows } from '@/components/offer-rows';
import { getCategoriesCached } from '@/lib/server-catalogue';
import { offerRowsAt, promoImage, tileImage, type ProductCardDto } from '@belzo/shared';

/** Map a managed promo colour to the classic tile's gradient so the classic
 *  look is preserved while the content is admin-managed. */
const CLASSIC_PROMO_GRADIENT: Record<PromoContent['color'], string> = {
  blue: 'linear-gradient(135deg, #396afc, #2948ff)',
  pink: 'linear-gradient(135deg, #f857a6, #ff5858)',
  green: 'linear-gradient(135deg, #11998e, #38ef7d)',
  amber: 'linear-gradient(135deg, #f7971e, #ffd200)',
};

export const dynamic = 'force-dynamic';

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 0 };

/** World-class storefront home: category circles, hero carousel, deal rails,
 *  per-category rails, promo banners and new arrivals. */
export default async function HomePage() {
  if ((await getTheme()) === 'emart') return <EmartHome />;

  const [categories, banners, { home, sections, offerRows }] = await Promise.all([
    getCategoriesCached(),
    contentApi.banners('home_hero').catch(() => []),
    getSiteContent(),
  ]);
  const blocks = home.blocks.filter((b) => b.enabled !== false);

  const [resolvedSections, byCategory] = await Promise.all([
    resolveHomeSections(getHomeSections(sections)),
    Promise.all(
      categories.map((c) =>
        catalogueApi
          .products(new URLSearchParams({ categoryId: c.id, pageSize: '12' }).toString())
          .catch(() => EMPTY),
      ),
    ),
  ]);

  // Admin-managed banners take priority; fall back to styled gradient slides.
  const fallbackSlides: HeroSlide[] = [
    {
      title: 'Big Savings Days',
      subtitle: 'Up to 60% off across apparel, electronics, grocery & handicrafts.',
      cta: 'Shop the sale',
      href: categories[0] ? `/category/${categories[0].slug}` : '/search?sort=discount',
      background: 'linear-gradient(120deg, #2874f0 0%, #1c2f6b 100%)',
      badge: '⚡ BIG SAVINGS DAYS',
    },
    {
      title: 'Fresh Handicrafts, Made in India',
      subtitle: 'Handwoven, handmade and delivered across the country.',
      cta: 'Explore handicrafts',
      href: '/category/handicraft',
      background: 'linear-gradient(120deg, #f7971e 0%, #b8621b 100%)',
      badge: '🇮🇳 MADE IN INDIA',
    },
    {
      title: 'Everyday Essentials',
      subtitle: 'Grocery & electronics at prices you will love.',
      cta: 'Start shopping',
      href: '/category/grocery',
      background: 'linear-gradient(120deg, #11998e 0%, #0b5d55 100%)',
      badge: '🔥 EVERYDAY LOW PRICES',
    },
  ];

  const heroSlides: HeroSlide[] =
    banners.length > 0
      ? banners.map((b) => ({
          title: b.title ?? 'Belzo eMart offer',
          subtitle: '',
          cta: 'Shop now',
          href: b.linkUrl || '/search?sort=discount',
          background: '#ffffff',
          image: b.imageUrl,
        }))
      : fallbackSlides;

  return (
    <div className="home" data-testid="home-page">
      {/* Hero carousel */}
      <div className="home__section">
        <HeroCarousel slides={heroSlides} />
      </div>

      {/* Offer banners: right below the main banner */}
      <OfferRows rows={offerRowsAt(offerRows, 'after_hero')} />

      {/* Admin-managed home sections (shared config, both themes) */}
      {resolvedSections.map((s) => (
        <ProductRail
          key={s.id}
          title={s.title}
          viewAllHref={s.viewAllHref}
          products={s.products}
          testId={`home-section-${s.id}`}
        />
      ))}

      {/* Offer banners: below Deals of the Day and the other product sections */}
      <OfferRows rows={offerRowsAt(offerRows, 'after_deals')} />

      {/* Per-category rails */}
      {categories.map((c, i) => (
        <ProductRail
          key={c.id}
          title={`Best of ${c.name}`}
          viewAllHref={`/category/${c.slug}`}
          products={byCategory[i]?.items ?? []}
          testId={`home-rail-${c.slug}`}
          promo={{
            title: c.name,
            subtitle: `Top picks in ${c.name.toLowerCase()}.`,
            cta: 'Shop now →',
            href: `/category/${c.slug}`,
            background: gradientFor(c.slug),
          }}
        />
      ))}

      {/* Offer banners: after the category rails (the classic home has no category circles) */}
      <OfferRows rows={offerRowsAt(offerRows, 'after_categories')} />
      {/* Promo banner grid — admin-managed per-theme content */}
      <section className="home__section promo-grid" data-testid="home-promos">
        {home.promos.map((p, i) => {
          const image = promoImage(p);
          return image ? (
            <Link key={i} href={p.href} className="promo-tile promo-tile--img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={p.title} loading="lazy" />
            </Link>
          ) : (
            <Link
              key={i}
              href={p.href}
              className="promo-tile"
              style={{ background: CLASSIC_PROMO_GRADIENT[p.color] }}
            >
              <div>
                <h3>{p.title}</h3>
                <p>{p.subtitle}</p>
              </div>
              <span>{p.cta} →</span>
            </Link>
          );
        })}
      </section>

      {/* Admin-managed custom detail blocks (theme-scoped content) */}
      {blocks.map((b, i) => (
        <section className="home__section home-block" key={i} data-block-type={b.type}>
          {b.type === 'banner' ? (
            <div className="home-block__banner">
              {isUsableImageUrl(b.imageUrl) && b.imageUrl !== '#' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt="" className="home-block__img" />
              )}
              <div className="home-block__body">
                {b.title && <h2>{b.title}</h2>}
                {b.text && <p>{b.text}</p>}
                {b.ctaText.trim() !== '' && (
                  <Link href={b.ctaHref} className="home-block__cta">
                    {b.ctaText} →
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              {b.title && <h2 className="home-block__head">{b.title}</h2>}
              <div className="promo-grid">
                {b.cards.map((c, ci) => {
                  const image = tileImage(c);
                  return image ? (
                    <Link key={ci} href={c.href} className="promo-tile promo-tile--img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={c.title} loading="lazy" />
                    </Link>
                  ) : (
                    <Link key={ci} href={c.href} className="promo-tile">
                      <div>
                        <h3>{c.title}</h3>
                        {c.subtitle && <p>{c.subtitle}</p>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
