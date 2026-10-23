import Link from 'next/link';
import { tileImage, type HomeBlockCard } from '@belzo/shared';
import { offerLink } from '@/lib/offer-link';

/**
 * The cards of an "Info cards" block. A card with a picture shows just that picture (its title
 * is the description); one without is a text card. Cards carry no icon.
 */
export function InfoCards({ cards }: { cards: HomeBlockCard[] }) {
  return (
    <div className="em-block__cards">
      {cards.map((c, i) => {
        const image = tileImage(c);
        const link = offerLink(c.href);
        const className = `em-cardlet${image ? ' em-cardlet--image' : ''}`;
        const inner = image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={c.title} loading="lazy" className="em-cardlet__img" />
        ) : (
          <>
            <strong>{c.title}</strong>
            {c.subtitle && <span>{c.subtitle}</span>}
          </>
        );
        const common = { className, 'data-testid': `info-card-${i}` } as const;
        if (link.kind === 'internal') {
          return (
            <Link key={i} href={link.href} {...common}>
              {inner}
            </Link>
          );
        }
        if (link.kind === 'external') {
          return (
            <a key={i} href={link.href} target="_blank" rel="noopener noreferrer" {...common}>
              {inner}
            </a>
          );
        }
        return (
          <div key={i} {...common}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
