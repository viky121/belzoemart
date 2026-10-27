import type { CartOffer } from '@belzo/shared';
import { placeholderImage, isUsableImageUrl } from '@/lib/category-theme';
import { cartOfferCard, cartOffersToShow } from '@/lib/spend-offers';

/**
 * "Shop ₹2,000 and get Sugar 1 kg at ₹29" cards for the cart: a progress bar while it is locked, an Add button
 * once it is unlocked, and a quiet note once the offer price is being charged.
 */
export function CartOffers({
  offers,
  busy,
  onAdd,
}: {
  offers: readonly CartOffer[] | undefined;
  busy?: boolean;
  onAdd: (variantId: string) => void;
}) {
  const shown = cartOffersToShow(offers);
  if (shown.length === 0) return null;
  return (
    <div className="offerbar" data-testid="cart-offers">
      {shown.map((o) => {
        const card = cartOfferCard(o);
        const img = isUsableImageUrl(card.imageUrl) ? card.imageUrl! : placeholderImage(card.title, card.variantId);
        return (
          <div key={card.offerId} className={`offerbar__card offerbar__card--${card.kind}`} data-testid={`cart-offer-${card.offerId}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="offerbar__img" src={img} alt="" />
            <div className="offerbar__body">
              <strong className="offerbar__title">🎁 {card.headline}</strong>
              <span className="offerbar__detail" data-testid={`cart-offer-detail-${card.offerId}`}>{card.detail}</span>
              {card.kind === 'progress' && (
                <div
                  className="offerbar__track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={card.percent}
                  aria-label={`Progress towards ${card.headline}`}
                >
                  <div className="offerbar__fill" style={{ width: `${card.percent}%` }} />
                </div>
              )}
            </div>
            {card.kind === 'add' && (
              <button type="button" className="offerbar__add" disabled={busy} onClick={() => onAdd(card.variantId)} data-testid={`cart-offer-add-${card.offerId}`}>
                Add
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
