export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const FLY_SIZE = 56;
export const FLY_MS = 640;

/** Where a flying picture starts and ends: the centre of the product picture and of the Cart tab icon. */
export function flightFrames(from: Box, to: Box): Keyframe[] {
  const x0 = from.left + from.width / 2 - FLY_SIZE / 2;
  const y0 = from.top + from.height / 2 - FLY_SIZE / 2;
  const x1 = to.left + to.width / 2 - FLY_SIZE / 2;
  const y1 = to.top + to.height / 2 - FLY_SIZE / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  return [
    { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
    // A small arc: the picture first rises a little, then drops into the tab.
    { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 28}px) scale(0.7)`, opacity: 0.95, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.18)`, opacity: 0.25, offset: 1 },
  ];
}

const PHONE = '(max-width: 900px)';

/** True on a phone-size screen, where the bottom bar (and so the Cart tab) exists. */
export function isPhoneLayout(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;
}

/**
 * Makes the product picture fly into the Cart tab, bumps the tab and vibrates a little. Purely a
 * flourish: it never throws and does nothing when the screen has no Cart tab or the visitor asked for
 * less motion, so adding to the cart never depends on it.
 */
export function flyToCart(source: Element | null, imageUrl?: string | null): void {
  try {
    if (!isPhoneLayout()) return;
    const target = document.querySelector('[data-cart-target]');
    if (!target) return;
    const to = target.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return;
    // The buzz and the bump are feedback, so they stay even when the picture does not move.
    window.dispatchEvent(new Event('belzo:cart-bump'));
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(18);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !source || typeof document.body.animate !== 'function') return;
    const from = source.getBoundingClientRect();
    if (from.width === 0 || from.height === 0) return;
    const el = document.createElement('div');
    el.className = 'fly-ghost';
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${from.left + from.width / 2 - FLY_SIZE / 2}px`;
    el.style.top = `${from.top + from.height / 2 - FLY_SIZE / 2}px`;
    if (imageUrl) el.style.backgroundImage = `url("${imageUrl.replace(/"/g, '%22')}")`;
    document.body.appendChild(el);
    const anim = el.animate(flightFrames(from, to), { duration: FLY_MS, easing: 'cubic-bezier(0.4, 0.1, 0.2, 1)', fill: 'forwards' });
    const done = () => el.remove();
    anim.onfinish = done;
    anim.oncancel = done;
    setTimeout(done, FLY_MS + 400);
  } catch {
    /* a flourish only */
  }
}
