'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CategoryIcon } from '@/components/category-icon';

interface Cat {
  id: string;
  name: string;
  slug: string;
}

/**
 * Header category strip with active-state highlighting: the category matching
 * the current route is tinted Flipkart-blue (icon + label), the rest stay in
 * the default dark colour.
 */
export function CategoryStrip({ categories }: { categories: Cat[] }) {
  const pathname = usePathname();
  if (categories.length === 0) return null;

  const cls = (active: boolean) => `cat-link${active ? ' cat-link--active' : ''}`;

  return (
    <div className="cat-strip">
      <div className="container">
        <div className="cat-strip__inner" data-testid="header-categories">
          <Link href="/" className={cls(pathname === '/')}>
            <span className="cat-link__icon">
              <CategoryIcon name="For You" icon="for-you" />
            </span>
            For You
          </Link>

          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className={cls(pathname === `/category/${c.slug}`)}
              data-testid={`nav-category-${c.slug}`}
            >
              <span className="cat-link__icon">
                <CategoryIcon name={`${c.name} ${c.slug}`} />
              </span>
              {c.name}
            </Link>
          ))}

          <Link href="/orders" className={cls(pathname.startsWith('/orders'))}>
            <span className="cat-link__icon">
              <CategoryIcon name="Track Order" icon="truck" />
            </span>
            Track Order
          </Link>
        </div>
      </div>
    </div>
  );
}
