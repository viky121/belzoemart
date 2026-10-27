'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
interface Cat {
  id: string;
  name: string;
  slug: string;
}
/**
 * Category nav links with active-state highlighting for the current route.
 * They sit in one line; on a phone that line is a swipeable slider.
 */
export function CatbarNav({ categories }: { categories: Cat[] }) {
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const active = (href: string) =>
    (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))
      ? 'is-active'
      : undefined;
  // On a narrow screen the open category can be off to the side; bring it into view.
  useEffect(() => {
    const row = box.current;
    const current = row?.querySelector<HTMLElement>('a.is-active');
    if (!row || !current) return;
    row.scrollLeft = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
  }, [pathname]);
  return (
    <div className="em-catbar__links" ref={box}>
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
    </div>
  );
}
