import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogueApi, formatInr, type Paginated } from '@/lib/catalogue-api';
import { placeholderImage } from '@/lib/category-theme';
import { ProductGallery } from '@/components/product-gallery';
import { ProductRail } from '@/components/product-rail';
import { ProductVariants } from './product-variants';
import { ReviewsPanel } from './reviews-panel';
import { Breadcrumbs, type Crumb } from '@/components/breadcrumbs';
import { categoryTrailById } from '@/lib/category-trail';
import type { CategoryNodeDto, ProductCardDto } from '@belzo/shared';

export const dynamic = 'force-dynamic';

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 0 };

/** SEO metadata from the admin-entered meta fields (falls back to product data). */
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const p = await catalogueApi.product(params.slug).catch(() => null);
  if (!p) return { title: 'Product · Belzo eMart' };
  const title = p.seo?.title || `${p.title} · Belzo eMart`;
  const description =
    p.seo?.description || (p.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    title,
    description,
    keywords: p.seo?.keywords || undefined,
    openGraph: {
      title,
      description,
      images: p.imageUrl ? [{ url: p.imageUrl }] : undefined,
    },
  };
}

/** Product detail page (FR-3): gallery, price, variants, key features, reviews, similar. */
export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await catalogueApi.product(params.slug).catch(() => null);
  if (!product) notFound();

  // Breadcrumb: Home › Category › Sub-category … › Product. If the category can't be
  // found (deleted/unlisted) the trail is just Home › Product.
  const categories = await catalogueApi.categories().catch(() => [] as CategoryNodeDto[]);
  const crumbs: Crumb[] = [
    ...(categoryTrailById(categories, product.categoryId) ?? []).map((c) => ({
      label: c.name,
      href: `/category/${c.slug}`,
    })),
    { label: product.title },
  ];

  // Related products: prefer same-category items; if the category has none
  // besides this product, fall back to other catalogue products so the section
  // still shows useful suggestions instead of nothing.
  const similar = await catalogueApi
    .products(new URLSearchParams({ categoryId: product.categoryId, pageSize: '12' }).toString())
    .catch(() => EMPTY);
  let relatedItems = similar.items.filter((p) => p.id !== product.id).slice(0, 10);
  if (relatedItems.length === 0) {
    const more = await catalogueApi
      .products(new URLSearchParams({ pageSize: '12' }).toString())
      .catch(() => EMPTY);
    relatedItems = more.items.filter((p) => p.id !== product.id).slice(0, 10);
  }

  // Key features: admin enters one feature per line in the description field.
  const features = (product.description || '')
    .split(/\r?\n|•|\u2022/)
    .map((s) => s.trim())
    .filter(Boolean);

  const fallback = placeholderImage(product.title, product.slug);

  return (
    <section style={{ padding: '1.5rem 0' }} data-testid="product-detail">
      <Breadcrumbs items={crumbs} testId="pdp-breadcrumb" />
      <div className="pdp">
        <ProductGallery images={product.images} fallback={fallback} title={product.title} />

        <div className="pdp__info">
          {product.brand && (
            <p className="pdp__brand">
              {product.brandId ? (
                <Link href={`/search?brandId=${product.brandId}`} data-testid="pdp-brand-link">
                  {product.brand}
                </Link>
              ) : (
                product.brand
              )}
            </p>
          )}
          <h1 data-testid="pdp-title">{product.title}</h1>

          {product.ratingCount > 0 && (
            <div className="pdp__rating" data-testid="pdp-rating">
              <span className="rating-pill">{product.ratingAvg.toFixed(1)} ★</span>
              <span className="pdp__rating-count">
                {product.ratingCount.toLocaleString('en-IN')} ratings
              </span>
            </div>
          )}

          <ProductVariants variants={product.variants} taxRatePct={product.taxRatePct}>

          {/* Trust badges */}
          <div className="trust-row">
            <div className="trust-item">
              <span className="trust-item__icon">⏱️</span>
              <span className="trust-item__title">Easy Cancellation</span>
              <span className="trust-item__sub">Up to 24 hours</span>
            </div>
            {product.isReturnable === false ? (
              <div className="trust-item">
                <span className="trust-item__icon">🚫</span>
                <span className="trust-item__title">No Returns</span>
                <span className="trust-item__sub">Food &amp; perishables</span>
              </div>
            ) : (
              <div className="trust-item">
                <span className="trust-item__icon">🔄</span>
                <span className="trust-item__title">7-Day Return</span>
                <span className="trust-item__sub">No questions asked</span>
              </div>
            )}
            <div className="trust-item">
              <span className="trust-item__icon">💵</span>
              <span className="trust-item__title">Cash on Delivery</span>
              <span className="trust-item__sub">Pay at your door</span>
            </div>
          </div>

          </ProductVariants>
        </div>
      </div>

      {/* Key features + Ratings and reviews */}
      <div className="pdp-details">
        <section className="pdp-block">
          <div className="pdp-block__head">
            <h2>Key Features</h2>
          </div>
          {features.length > 0 ? (
            <ul className="pdp-features" data-testid="pdp-key-features">
              {features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="pdp-block__desc">Product highlights coming soon.</p>
          )}
          <ul className="pdp-specs">
            {product.brand && (
              <li>
                <span>Brand</span>
                <strong>
                  {product.brandId ? (
                    <Link href={`/search?brandId=${product.brandId}`}>{product.brand}</Link>
                  ) : (
                    product.brand
                  )}
                </strong>
              </li>
            )}
            {Object.entries(product.attributes ?? {})
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  <strong>{v}</strong>
                </li>
              ))}
            <li>
              <span>HSN Code</span>
              <strong>{product.hsnCode || '—'}</strong>
            </li>
            <li>
              <span>GST</span>
              <strong>{product.taxRatePct}%</strong>
            </li>
          </ul>
        </section>

        {(product.shgName || product.story) && (
          <section className="pdp-block">
            <div className="pdp-block__head">
              <h2>The Story Behind This Product</h2>
            </div>
            {product.shgName && (
              <p className="pdp-story__by">
                Made by <strong>{product.shgName}</strong>
              </p>
            )}
            {product.story && <p className="pdp-block__desc">{product.story}</p>}
          </section>
        )}

        <section className="pdp-block">
          <div className="pdp-block__head">
            <h2>Customer Reviews</h2>
          </div>
          <ReviewsPanel
            productId={product.id}
            ratingAvg={product.ratingAvg}
            ratingCount={product.ratingCount}
          />
        </section>
      </div>

      {/* Related products (same category, falling back to other items) */}
      {relatedItems.length > 0 && (
        <div className="pdp-similar">
          <ProductRail title="Related Products" products={relatedItems} testId="pdp-similar" />
        </div>
      )}
    </section>
  );
}
