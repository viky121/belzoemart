import Link from 'next/link';

export interface Crumb {
  label: string;
  /** Omit on the last crumb (the page being viewed). */
  href?: string;
}

/** "Home › Category › … › This page". Every crumb with an `href` is a link; the last one is plain text. */
export function Breadcrumbs({ items, testId = 'breadcrumb' }: { items: Crumb[]; testId?: string }) {
  return (
    <nav className="plp-breadcrumb pdp-crumbs" aria-label="Breadcrumb" data-testid={testId}>
      <Link href="/">Home</Link>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${i}-${c.label}`} className="plp-breadcrumb__item">
            <span aria-hidden="true">›</span>
            {c.href && !last ? (
              <Link href={c.href}>{c.label}</Link>
            ) : (
              <span className="plp-breadcrumb__current" aria-current={last ? 'page' : undefined}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
