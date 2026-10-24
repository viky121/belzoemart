import { formatInr } from '@belzo/shared';

export type OfferStatus = 'live' | 'scheduled' | 'ended' | 'off';

export interface AdminOffer {
  id: string;
  name: string;
  isActive: boolean;
  status: OfferStatus;
  startsAt: string | null;
  endsAt: string | null;
  minSpend: number;
  specialPrice: number;
  units: number;
  variant: {
    id: string;
    productId: string;
    title: string;
    unit: string;
    sellingPrice: number;
    imageUrl: string | null;
    available: number;
  };
  belowCost: boolean;
  soldUnits: number;
}

export interface OfferPack {
  variantId: string;
  productId: string;
  title: string;
  unit: string;
  sellingPrice: number;
  imageUrl: string | null;
  available: number;
  minOrderQty: number;
}

/** What the admin types into the form, as text. */
export interface OfferForm {
  name: string;
  spendRupees: string;
  specialRupees: string;
  units: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  pack: OfferPack | null;
}

export const emptyForm = (): OfferForm => ({
  name: '', spendRupees: '', specialRupees: '', units: '1', startsAt: '', endsAt: '', isActive: true, pack: null,
});

/** "29", "29.5", "2,000" -> paise. null when it is not a money amount with at most 2 decimals. */
export function rupeesToPaise(text: string): number | null {
  const clean = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Paise -> text for an input ("2900" -> "29", "2950" -> "29.5"). */
export function paiseToRupees(paise: number): string {
  return String(paise / 100);
}

/** ISO date -> value for <input type="datetime-local"> in the browser's time zone. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Value of <input type="datetime-local"> -> ISO date, or null when empty. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formFromOffer(o: AdminOffer): OfferForm {
  return {
    name: o.name,
    spendRupees: paiseToRupees(o.minSpend),
    specialRupees: paiseToRupees(o.specialPrice),
    units: String(o.units),
    startsAt: isoToLocalInput(o.startsAt),
    endsAt: isoToLocalInput(o.endsAt),
    isActive: o.isActive,
    pack: {
      variantId: o.variant.id,
      productId: o.variant.productId,
      title: o.variant.title,
      unit: o.variant.unit,
      sellingPrice: o.variant.sellingPrice,
      imageUrl: o.variant.imageUrl,
      available: o.variant.available,
      minOrderQty: 1,
    },
  };
}

export interface OfferBody {
  name: string;
  minSpend: number;
  variantId: string;
  specialPrice: number;
  units: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

/** Checks the form like the server does, in plain words. Returns the body to send or the first problem. */
export function buildOfferBody(f: OfferForm): { ok: true; body: OfferBody } | { ok: false; error: string } {
  if (f.name.trim().length < 1) return { ok: false, error: 'Give the offer a name.' };
  if (!f.pack) return { ok: false, error: 'Pick the product pack that gets the special price.' };
  const minSpend = rupeesToPaise(f.spendRupees);
  if (minSpend === null || minSpend < 100) return { ok: false, error: 'Enter the spend amount in rupees (at least ₹1).' };
  const specialPrice = rupeesToPaise(f.specialRupees);
  if (specialPrice === null || specialPrice < 100) return { ok: false, error: 'Enter the special price in rupees (at least ₹1).' };
  if (specialPrice >= f.pack.sellingPrice) {
    return { ok: false, error: `The special price must be lower than the normal price (${formatInr(f.pack.sellingPrice)}).` };
  }
  const units = Number(f.units);
  if (!Number.isInteger(units) || units < 1 || units > 10) return { ok: false, error: 'Units per order must be a whole number from 1 to 10.' };
  if (f.pack.minOrderQty > units) {
    return { ok: false, error: `This pack needs at least ${f.pack.minOrderQty} per order, so units per order cannot be lower.` };
  }
  const startsAt = localInputToIso(f.startsAt);
  const endsAt = localInputToIso(f.endsAt);
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return { ok: false, error: 'The end date must be after the start date.' };
  return { ok: true, body: { name: f.name.trim(), minSpend, variantId: f.pack.variantId, specialPrice, units, isActive: f.isActive, startsAt, endsAt } };
}

export const STATUS_TEXT: Record<OfferStatus, string> = { live: 'Live', scheduled: 'Scheduled', ended: 'Ended', off: 'Switched off' };
export const STATUS_CLASS: Record<OfferStatus, string> = {
  live: 'admin-status--ok', scheduled: 'admin-status--info', ended: 'admin-status--warn', off: 'admin-status--bad',
};

/** One line saying what the offer does, for the list. */
export function offerSummary(o: Pick<AdminOffer, 'minSpend' | 'specialPrice' | 'units' | 'variant'>): string {
  const pack = o.variant.unit ? `${o.variant.title} ${o.variant.unit}` : o.variant.title;
  return `Shop ${formatInr(o.minSpend)}, get ${pack} at ${formatInr(o.specialPrice)} (${o.units === 1 ? '1 per order' : `up to ${o.units} per order`})`;
}
