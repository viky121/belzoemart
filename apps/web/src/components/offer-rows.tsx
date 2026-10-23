import Link from 'next/link';
import { MOBILE_OFFER_ASPECT, type MobileOfferRow } from '@belzo/shared';
import { offerLink } from '@/lib/offer-link';

/**
 * Admin-managed offer banners (Admin → Mobile app → Offer rows), shown on the home page
 * exactly as in the app: each row lays its banners out 1, 2 or 3 per line, extra banners
 * wrap onto the next line, and the row can have a title. Pass the rows for one position
 * (see offerRowsAt); renders nothing when there are none.
 */
export function OfferRows({ rows }: { rows: MobileOfferRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="offer-rows" data-testid="offer-rows">
      {rows.map((row) => (
        <section key={row.id} className="offer-row" data-testid={`offer-row-${row.id}`}>
          {row.title && <h2 className="offer-row__title">{row.title}</h2>}
          <div
            className={`offer-row__grid offer-row__grid--${row.columns}`}
            style={{ ['--offer-ratio' as string]: String(MOBILE_OFFER_ASPECT[row.columns]) }}
          >
            {row.banners.map((b) => {
              const link = offerLink(b.linkUrl);
              const img = (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imageUrl} alt={b.title || 'Offer'} loading="lazy" className="offer-banner__img" />
              );
              if (link.kind === 'internal') {
                return (
                  <Link key={b.id} href={link.href} className="offer-banner" data-testid={`offer-banner-${b.id}`}>
                    {img}
                  </Link>
                );
              }
              if (link.kind === 'external') {
                return (
                  <a
                    key={b.id}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="offer-banner"
                    data-testid={`offer-banner-${b.id}`}
                  >
                    {img}
                  </a>
                );
              }
              return (
                <div key={b.id} className="offer-banner offer-banner--static" data-testid={`offer-banner-${b.id}`}>
                  {img}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
