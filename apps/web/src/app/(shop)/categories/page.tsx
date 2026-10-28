import Link from 'next/link';
import type { CategoryNodeDto } from '@belzo/shared';
import { catalogueApi } from '@/lib/catalogue-api';
import { gradientFor, iconFor, isUsableImageUrl } from '@/lib/category-theme';
import { subtitleFor } from '@/lib/phone-pages';

export const dynamic = 'force-dynamic';

/** Categories tab: every top-level category with its picture. A tap opens that category. */
export default async function CategoriesPage() {
  const categories = await catalogueApi.categories().catch(() => [] as CategoryNodeDto[]);
  return (
    <div className="catpg" data-testid="categories-page">
      <h1 className="catpg__title">Categories</h1>
      <p className="catpg__sub">Pick a category to start shopping</p>
      {categories.length === 0 ? (
        <p className="catpg__empty">No categories yet.</p>
      ) : (
        <ul className="catpg__grid">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/category/${c.slug}`} className="catpg__card" data-testid={`categories-${c.slug}`}>
                <span className="catpg__pic" style={isUsableImageUrl(c.imageUrl) ? undefined : { background: gradientFor(c.slug) }}>
                  {isUsableImageUrl(c.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="catpg__emoji">{iconFor(c.slug)}</span>
                  )}
                </span>
                <strong className="catpg__name">{c.name}</strong>
                <span className="catpg__hint">{subtitleFor(c)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
