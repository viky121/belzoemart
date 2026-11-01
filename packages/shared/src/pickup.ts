/**
 * Self pickup: the customer collects the order from the shop instead of home delivery.
 *
 * This file holds the pure rules shared by the API and both apps: how the shop's pickup settings are read,
 * which day/time slots are offered at a given moment, and the labels. All times are India time
 * (Asia/Kolkata, UTC+5:30, no daylight saving), so a slot means the same thing on every device.
 */

export const FULFILMENT_METHODS = ['delivery', 'pickup'] as const;
export type FulfilmentMethod = (typeof FULFILMENT_METHODS)[number];

/** Pickup settings keys (Admin > Settings). */
export const PICKUP_SETTING_KEYS = {
  enabled: 'pickup.enabled',
  openTime: 'pickup.openTime',
  closeTime: 'pickup.closeTime',
  slotMinutes: 'pickup.slotMinutes',
  note: 'pickup.note',
} as const;

export interface PickupConfig {
  /** Self pickup is offered at checkout. */
  enabled: boolean;
  /** "HH:MM" 24-hour, India time. */
  openTime: string;
  closeTime: string;
  /** Length of one slot in minutes. */
  slotMinutes: number;
  /** Timings / instructions shown to the customer, or null. */
  note: string | null;
}

export const PICKUP_DEFAULTS: PickupConfig = {
  enabled: true,
  openTime: '10:00',
  closeTime: '20:00',
  slotMinutes: 60,
  note: null,
};

/** The earliest slot starts this long after "now" (the shop needs time to pack). */
export const PICKUP_LEAD_MINUTES = 120;
/** Days offered after today (0 = today, 1 = tomorrow, 2 = the day after). */
export const PICKUP_DAYS_AHEAD = 2;
/** Slot length bounds (minutes). */
export const PICKUP_SLOT_MIN = 15;
export const PICKUP_SLOT_MAX = 240;

const IST_OFFSET_MS = 330 * 60_000;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "9:5" is refused, "09:05" and "9:05" are accepted; returns minutes after midnight or null. */
export function parseHHMM(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = HHMM.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function toHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Read the pickup settings. Anything missing or invalid falls back to the default for that field, and a
 * closing time that leaves no room for one slot falls back to the default hours, so a wrong setting can
 * never leave the customer with no slot by accident. (The shop switches pickup off with `enabled`.)
 */
export function normalizePickupConfig(raw: {
  enabled?: unknown;
  openTime?: unknown;
  closeTime?: unknown;
  slotMinutes?: unknown;
  note?: unknown;
}): PickupConfig {
  const slotRaw = raw.slotMinutes;
  const slotMinutes =
    typeof slotRaw === 'number' && Number.isInteger(slotRaw) && slotRaw >= PICKUP_SLOT_MIN && slotRaw <= PICKUP_SLOT_MAX
      ? slotRaw
      : PICKUP_DEFAULTS.slotMinutes;
  // Each time falls back to its own default; only an impossible pair (no room for one slot) resets both.
  let open = parseHHMM(raw.openTime) ?? parseHHMM(PICKUP_DEFAULTS.openTime)!;
  let close = parseHHMM(raw.closeTime) ?? parseHHMM(PICKUP_DEFAULTS.closeTime)!;
  if (close - open < slotMinutes) {
    open = parseHHMM(PICKUP_DEFAULTS.openTime)!;
    close = parseHHMM(PICKUP_DEFAULTS.closeTime)!;
  }
  const note = typeof raw.note === 'string' && raw.note.trim().length > 0 ? raw.note.trim().slice(0, 300) : null;
  return {
    enabled: raw.enabled !== false,
    openTime: toHHMM(open),
    closeTime: toHHMM(close),
    slotMinutes,
    note,
  };
}

export interface PickupSlot {
  /** ISO time (UTC) the slot starts; this is also the value the customer sends back. */
  start: string;
  end: string;
  /** "10:00 AM - 11:00 AM" */
  label: string;
}

export interface PickupDay {
  /** India calendar date, "2026-10-31". */
  date: string;
  /** "Today", "Tomorrow" or "Mon, 2 Nov". */
  label: string;
  slots: PickupSlot[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "10:00 AM" from minutes after midnight. */
function clock12(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "10:00 AM - 11:00 AM" */
export function slotLabel(startMinutes: number, endMinutes: number): string {
  return `${clock12(startMinutes)} - ${clock12(endMinutes)}`;
}

/**
 * The days and slots offered at `now`: today and the next PICKUP_DAYS_AHEAD days. For today only slots
 * that start at least PICKUP_LEAD_MINUTES from now are kept; a day with no slot left is left out. Slots
 * run from the opening time in steps of the slot length, and the last one must end by the closing time.
 */
export function buildPickupDays(config: PickupConfig, now: Date): PickupDay[] {
  if (!config.enabled) return [];
  const open = parseHHMM(config.openTime)!;
  const close = parseHHMM(config.closeTime)!;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const earliest = now.getTime() + PICKUP_LEAD_MINUTES * 60_000;
  const days: PickupDay[] = [];
  for (let d = 0; d <= PICKUP_DAYS_AHEAD; d += 1) {
    // Midnight (India) of day d, as a UTC-based calendar date.
    const dayStartUtc = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + d);
    const cal = new Date(dayStartUtc);
    const slots: PickupSlot[] = [];
    for (let s = open; s + config.slotMinutes <= close; s += config.slotMinutes) {
      const startMs = dayStartUtc + s * 60_000 - IST_OFFSET_MS;
      if (startMs < earliest) continue;
      const endMs = startMs + config.slotMinutes * 60_000;
      slots.push({
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        label: slotLabel(s, s + config.slotMinutes),
      });
    }
    if (slots.length === 0) continue;
    const date = `${cal.getUTCFullYear()}-${String(cal.getUTCMonth() + 1).padStart(2, '0')}-${String(cal.getUTCDate()).padStart(2, '0')}`;
    const label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${WEEKDAYS[cal.getUTCDay()]}, ${cal.getUTCDate()} ${MONTHS[cal.getUTCMonth()]}`;
    days.push({ date, label, slots });
  }
  return days;
}

/** The offered slot that starts at `startIso`, or null when that time is not on offer now. */
export function findOfferedSlot(days: PickupDay[], startIso: string): PickupSlot | null {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return null;
  for (const day of days) {
    for (const slot of day.slots) if (Date.parse(slot.start) === t) return slot;
  }
  return null;
}

/** "Sat, 31 Oct, 10:00 AM - 11:00 AM" for a stored slot (India time). */
export function formatPickupSlot(startIso: string | Date | null | undefined, endIso: string | Date | null | undefined): string | null {
  if (!startIso || !endIso) return null;
  const s = new Date(typeof startIso === 'string' ? startIso : startIso.getTime());
  const e = new Date(typeof endIso === 'string' ? endIso : endIso.getTime());
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const sIst = new Date(s.getTime() + IST_OFFSET_MS);
  const eIst = new Date(e.getTime() + IST_OFFSET_MS);
  const sMin = sIst.getUTCHours() * 60 + sIst.getUTCMinutes();
  const eMin = eIst.getUTCHours() * 60 + eIst.getUTCMinutes();
  const day = `${WEEKDAYS[sIst.getUTCDay()]}, ${sIst.getUTCDate()} ${MONTHS[sIst.getUTCMonth()]}`;
  return `${day}, ${slotLabel(sMin, eMin)}`;
}

/** What the public pickup endpoint returns (GET /checkout/pickup). */
export interface PickupInfo {
  enabled: boolean;
  note: string | null;
  shop: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    phone: string | null;
  };
  days: PickupDay[];
}

/** One line for the shop address: "Brahman colony, Kunvar Pura Road, Tikamgarh, Madhya Pradesh - 472001". */
export function shopAddressLine(shop: PickupInfo['shop']): string {
  const place = [shop.address, shop.city, shop.state].filter((x) => x && x.trim()).join(', ');
  const pin = shop.pincode?.trim();
  return pin ? (place ? `${place} - ${pin}` : pin) : place;
}

/** Cash choice wording: "Pay at shop on pickup" for a pickup order, "Cash on Delivery" otherwise. */
export function cashLabel(fulfilment: FulfilmentMethod | null | undefined): string {
  return fulfilment === 'pickup' ? 'Pay at shop on pickup' : 'Cash on Delivery';
}

/** The date of the day that holds the slot starting at `startIso`, else the first day on offer ('' when none). */
export function pickupDayOfSlot(days: PickupDay[], startIso: string): string {
  const t = Date.parse(startIso);
  const found = days.find((d) => d.slots.some((s) => Date.parse(s.start) === t));
  return (found ?? days[0])?.date ?? '';
}
