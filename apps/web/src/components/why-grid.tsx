import { tileImage, type WhyItem } from '@belzo/shared';

/**
 * "Why choose us" points. A point with a picture shows just that picture (its title is the
 * description); one without is a text point. Points carry no icon.
 */
export function WhyGrid({ items }: { items: WhyItem[] }) {
  return (
    <section className="em-why" data-testid="emart-why">
      <h2>Why Choose Belzo E Mart?</h2>
      <div className="em-why__grid">
        {items.map((w, i) => {
          const image = tileImage(w);
          return image ? (
            <div key={i} className="em-why__item em-why__item--image" data-testid={`why-item-${i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={w.title} loading="lazy" className="em-why__img" />
            </div>
          ) : (
            <div key={i} className="em-why__item" data-testid={`why-item-${i}`}>
              <strong>{w.title}</strong>
              {w.sub && <span>{w.sub}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
