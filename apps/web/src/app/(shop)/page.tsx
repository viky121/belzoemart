import Link from 'next/link';
import { catalogueApi, type Paginated } from '@/lib/catalogue-api';
import { HeroCarousel, type HeroSlide } from '@/components/hero-carousel';
import { ProductRail } from '@/components/product-rail';
import { gradientFor } from '@/lib/category-theme';
import { contentApi } from '@/lib/content-api';
import { getTheme } from '@/lib/theme';
import { getSiteContent } from '@/lib/site-content';
import { getHomeSections, resolveHomeSections } from '@/lib/home-sections';
import { EmartHome } from '@/components/emart-home';
import type { CategoryNodeDto, ProductCardDto } from '@belzo/shared';

export const dynamic = 'force-dynamic';

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 0 };

/** World-class storefront home: category circles, hero carousel, deal rails,
 *  per-category rails, promo banners and new arrivals. */
export default async function HomePage() {
  if ((await getTheme()) === 'emart') return <EmartHome />;

  const categories = await catalogueApi.categories().catch(() => [] as CategoryNodeDto[]);
  const banners = await contentApi.banners('home_hero').catch(() => []);
  const { sections } = await getSiteContent();

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

      {/* Promo banner grid */}
      <section className="home__section promo-grid" data-testid="home-promos">
        <Link
          href="/category/electronics"
          className="promo-tile"
          style={{ background: 'linear-gradient(135deg, #396afc, #2948ff)' }}
        >
          <div>
            <h3>Top Electronics</h3>
            <p>Earbuds, chargers &amp; more</p>
          </div>
          <span>Grab now →</span>
        </Link>
        <Link
          href="/category/apparel"
          className="promo-tile"
          style={{ background: 'linear-gradient(135deg, #f857a6, #ff5858)' }}
        >
          <div>
            <h3>Fashion Fiesta</h3>
            <p>Trending apparel picks</p>
          </div>
          <span>Explore →</span>
        </Link>
        <Link
          href="/category/grocery"
          className="promo-tile"
          style={{ background: 'linear-gradient(135deg, #11998e, #38ef7d)' }}
        >
          <div>
            <h3>Daily Grocery</h3>
            <p>Stock up &amp; save</p>
          </div>
          <span>Shop →</span>
        </Link>
        <Link
          href="/category/handicraft"
          className="promo-tile"
          style={{ background: 'linear-gradient(135deg, #f7971e, #ffd200)' }}
        >
          <div>
            <h3>Artisan Handicrafts</h3>
            <p>Handmade, Made in India</p>
          </div>
          <span>Discover →</span>
        </Link>
      </section>
    </div>
  );
}
