'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Cat {
  id: string;
  name: string;
  slug: string;
}

/** Category nav links with active-state highlighting for the current route. */
export function CatbarNav({ categories }: { categories: Cat[] }) {
  const pathname = usePathname();
  const active = (href: string) =>
    (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))
      ? 'is-active'
      : undefined;

  return (
    <>
      <Link href="/" className={active('/')}>
        Home
      </Link>
      {categories.map((c) => {
        const href = `/category/${c.slug}`;
        return (
          <Link key={c.id} href={href} className={active(href)} data-testid={`nav-category-${c.slug}`}>
            {c.name}
          </Link>
        );
      })}
    </>
  );
}
