import Link from 'next/link';
import { promoImage, type PromoContent } from '@belzo/shared';
import { offerLink } from '@/lib/offer-link';

/** Soft pastel backgrounds for the text tiles (themed heading + "Shop Now" pill). */
const PROMO_BG: Record<string, string> = {
  green: 'linear-gradient(135deg, #e9f9ef 0%, #d7f3e1 100%)',
  pink: 'linear-gradient(135deg, #fdeaf3 0%, #fbd9e8 100%)',
  blue: 'linear-gradient(135deg, #eaf4ff 0%, #dcebfd 100%)',
  amber: 'linear-gradient(135deg, #fff3e0 0%, #ffe8cc 100%)',
};

/**
 * The promo tiles under the categories. A tile with a picture shows just that picture (the
 * title is its description); a tile without one is a coloured text tile with a button. Tiles
 * carry no icon.
 */
export function PromoTiles({ promos }: { promos: PromoContent[] }) {
  return (
    <section className="em-promos" data-testid="emart-promos">
      {promos.map((p, i) => {
        const image = promoImage(p);
        const link = offerLink(p.href);
        const className = `em-promo${image ? ' em-promo--image' : ''}`;
        const style = image ? undefined : { background: PROMO_BG[p.color] ?? PROMO_BG.green };
        const inner = image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={p.title} loading="lazy" className="em-promo__img" />
        ) : (
          <div className="em-promo__body">
            <h3>{p.title}</h3>
            <p>{p.subtitle}</p>
            <span className="em-promo__cta">{p.cta} →</span>
          </div>
        );
        const common = { className, style, 'data-accent': p.color, 'data-testid': `promo-tile-${i}` } as const;
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
    </section>
  );
}
