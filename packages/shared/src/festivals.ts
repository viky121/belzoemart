/**
 * Festival themes for the mobile app (admin "Mobile" module → Festival theme).
 *
 * Pure data, shared by the admin preview and the app so both always agree. The
 * app maps each motif key to a drawn glyph (see apps/mobile); the admin maps it to
 * an emoji (MOTIF_EMOJI). Every colour is chosen so WHITE text on it meets WCAG AA
 * (4.5:1) — the header gradient and buttons carry white text.
 */

export const MOBILE_FESTIVALS = [
  'none',
  'diwali',
  'holi',
  'navratri',
  'dussehra',
  'durga_puja',
  'ganesh_chaturthi',
  'raksha_bandhan',
  'janmashtami',
  'maha_shivratri',
  'ram_navami',
  'makar_sankranti',
] as const;
export type MobileFestival = (typeof MOBILE_FESTIVALS)[number];

/** Decorative glyph keys; the app and the admin each render these their own way. */
export const FESTIVAL_MOTIFS = [
  'diya',
  'firework',
  'sparkle',
  'palette',
  'drop',
  'flower',
  'star',
  'bow',
  'fire',
  'flag',
  'bell',
  'elephant',
  'ribbon',
  'heart',
  'gift',
  'feather',
  'om',
  'moon',
  'kite',
  'sun',
  'wheat',
] as const;
export type FestivalMotif = (typeof FESTIVAL_MOTIFS)[number];

/** Emoji used by the admin preview (desktop browsers render all of these). */
export const MOTIF_EMOJI: Record<FestivalMotif, string> = {
  diya: '🪔',
  firework: '🎆',
  sparkle: '✨',
  palette: '🎨',
  drop: '💧',
  flower: '🌸',
  star: '⭐',
  bow: '🏹',
  fire: '🔥',
  flag: '🚩',
  bell: '🔔',
  elephant: '🐘',
  ribbon: '🎀',
  heart: '💖',
  gift: '🎁',
  feather: '🦚',
  om: '🕉️',
  moon: '🌙',
  kite: '🪁',
  sun: '☀️',
  wheat: '🌾',
};

export interface FestivalTheme {
  id: MobileFestival;
  label: string;
  /** Emoji for the admin picker. */
  emoji: string;
  /** English greeting shown in the app header banner ('' = no banner for 'none'). */
  greeting: string;
  /** Hindi / regional subtitle under the greeting. */
  greetingLocal: string;
  /** Solid brand colour: buttons, active tab, links. White text on it passes AA. */
  primary: string;
  /** Light tint for selected chips / highlights. */
  primaryBg: string;
  /** Header gradient stops (white text on both passes AA). */
  headerFrom: string;
  headerTo: string;
  /** Highlight colour for sparkles / accents (decorative only). */
  accent: string;
  /** Pastel tones cycled through the category circles. */
  tints: readonly string[];
  /** Decorative glyphs scattered/falling in the header banner. */
  motifs: readonly FestivalMotif[];
}

const BRAND_TINTS = ['#e4f3ec', '#fdeee4', '#e7f0ff', '#f3e8ff', '#e2f7ff', '#fff2d9', '#ffe3ec', '#e9fbf3'];

export const FESTIVAL_THEMES: Record<MobileFestival, FestivalTheme> = {
  none: {
    id: 'none',
    label: 'No festival (default)',
    emoji: '🛒',
    greeting: '',
    greetingLocal: '',
    primary: '#15674f',
    primaryBg: '#e4f3ec',
    headerFrom: '#15674f',
    headerTo: '#136b53',
    accent: '#f4601a',
    tints: BRAND_TINTS,
    motifs: [],
  },
  diwali: {
    id: 'diwali',
    label: 'Diwali',
    emoji: '🪔',
    greeting: 'Happy Diwali',
    greetingLocal: 'शुभ दीपावली',
    primary: '#c2410c',
    primaryBg: '#ffedd5',
    headerFrom: '#7c2d12',
    headerTo: '#c2410c',
    accent: '#fbbf24',
    tints: ['#ffedd5', '#fef3c7', '#fde68a', '#fed7aa', '#fecaca', '#fef9c3'],
    motifs: ['diya', 'firework', 'sparkle'],
  },
  holi: {
    id: 'holi',
    label: 'Holi',
    emoji: '🎨',
    greeting: 'Happy Holi',
    greetingLocal: 'होली की शुभकामनाएं',
    primary: '#be185d',
    primaryBg: '#fce7f3',
    headerFrom: '#6d28d9',
    headerTo: '#be185d',
    accent: '#facc15',
    tints: ['#fce7f3', '#ede9fe', '#dcfce7', '#fef9c3', '#dbeafe', '#ffedd5'],
    motifs: ['palette', 'drop', 'flower'],
  },
  navratri: {
    id: 'navratri',
    label: 'Navratri',
    emoji: '💃',
    greeting: 'Happy Navratri',
    greetingLocal: 'शुभ नवरात्रि',
    primary: '#b91c1c',
    primaryBg: '#fee2e2',
    headerFrom: '#9d174d',
    headerTo: '#c2410c',
    accent: '#fbbf24',
    tints: ['#fee2e2', '#fce7f3', '#ffedd5', '#fef3c7', '#ede9fe', '#dcfce7'],
    motifs: ['flower', 'diya', 'star'],
  },
  dussehra: {
    id: 'dussehra',
    label: 'Dussehra',
    emoji: '🏹',
    greeting: 'Happy Dussehra',
    greetingLocal: 'विजयादशमी की शुभकामनाएं',
    primary: '#b45309',
    primaryBg: '#fef3c7',
    headerFrom: '#7f1d1d',
    headerTo: '#b45309',
    accent: '#fcd34d',
    tints: ['#fef3c7', '#ffedd5', '#fee2e2', '#fef9c3', '#fed7aa', '#fde68a'],
    motifs: ['bow', 'fire', 'flag'],
  },
  durga_puja: {
    id: 'durga_puja',
    label: 'Durga Puja',
    emoji: '🔱',
    greeting: 'Shubho Durga Puja',
    greetingLocal: 'শুভ দুর্গাপূজা',
    primary: '#b91c1c',
    primaryBg: '#fee2e2',
    headerFrom: '#991b1b',
    headerTo: '#be123c',
    accent: '#fcd34d',
    tints: ['#fee2e2', '#fff1f2', '#fef3c7', '#ffe4e6', '#ffedd5', '#fce7f3'],
    motifs: ['bell', 'flower', 'sparkle'],
  },
  ganesh_chaturthi: {
    id: 'ganesh_chaturthi',
    label: 'Ganesh Chaturthi',
    emoji: '🐘',
    greeting: 'Ganpati Bappa Morya',
    greetingLocal: 'गणेश चतुर्थी की शुभकामनाएं',
    primary: '#c2410c',
    primaryBg: '#ffedd5',
    headerFrom: '#c2410c',
    headerTo: '#a16207',
    accent: '#fde047',
    tints: ['#ffedd5', '#fef9c3', '#fce7f3', '#fef3c7', '#dcfce7', '#fee2e2'],
    motifs: ['elephant', 'flower', 'sparkle'],
  },
  raksha_bandhan: {
    id: 'raksha_bandhan',
    label: 'Raksha Bandhan',
    emoji: '🎀',
    greeting: 'Happy Raksha Bandhan',
    greetingLocal: 'रक्षाबंधन की शुभकामनाएं',
    primary: '#be185d',
    primaryBg: '#fce7f3',
    headerFrom: '#9d174d',
    headerTo: '#a21caf',
    accent: '#fde047',
    tints: ['#fce7f3', '#fae8ff', '#ffe4e6', '#fef9c3', '#ede9fe', '#ffedd5'],
    motifs: ['ribbon', 'heart', 'gift'],
  },
  janmashtami: {
    id: 'janmashtami',
    label: 'Janmashtami',
    emoji: '🦚',
    greeting: 'Happy Janmashtami',
    greetingLocal: 'जन्माष्टमी की शुभकामनाएं',
    primary: '#1d4ed8',
    primaryBg: '#dbeafe',
    headerFrom: '#1e3a8a',
    headerTo: '#0f766e',
    accent: '#fde047',
    tints: ['#dbeafe', '#ccfbf1', '#e0e7ff', '#fef9c3', '#fce7f3', '#dcfce7'],
    motifs: ['feather', 'heart', 'sparkle'],
  },
  maha_shivratri: {
    id: 'maha_shivratri',
    label: 'Maha Shivratri',
    emoji: '🕉️',
    greeting: 'Har Har Mahadev',
    greetingLocal: 'महाशिवरात्रि की शुभकामनाएं',
    primary: '#4338ca',
    primaryBg: '#e0e7ff',
    headerFrom: '#1e1b4b',
    headerTo: '#4338ca',
    accent: '#c7d2fe',
    tints: ['#e0e7ff', '#ede9fe', '#f1f5f9', '#dbeafe', '#fae8ff', '#e2e8f0'],
    motifs: ['om', 'moon', 'star'],
  },
  ram_navami: {
    id: 'ram_navami',
    label: 'Ram Navami',
    emoji: '🚩',
    greeting: 'Jai Shri Ram',
    greetingLocal: 'रामनवमी की शुभकामनाएं',
    primary: '#c2410c',
    primaryBg: '#ffedd5',
    headerFrom: '#9a3412',
    headerTo: '#b45309',
    accent: '#fde047',
    tints: ['#ffedd5', '#fef3c7', '#fed7aa', '#fef9c3', '#fee2e2', '#dcfce7'],
    motifs: ['bow', 'flag', 'sparkle'],
  },
  makar_sankranti: {
    id: 'makar_sankranti',
    label: 'Makar Sankranti',
    emoji: '🪁',
    greeting: 'Happy Makar Sankranti',
    greetingLocal: 'मकर संक्रांति की शुभकामनाएं',
    primary: '#0369a1',
    primaryBg: '#e0f2fe',
    headerFrom: '#0c4a6e',
    headerTo: '#0369a1',
    accent: '#fb923c',
    tints: ['#e0f2fe', '#fef3c7', '#ffedd5', '#dcfce7', '#fce7f3', '#ede9fe'],
    motifs: ['kite', 'sun', 'wheat'],
  },
};

/** Theme for an id; anything unknown falls back to the default brand theme. */
export function getFestivalTheme(id: unknown): FestivalTheme {
  return typeof id === 'string' && id in FESTIVAL_THEMES
    ? FESTIVAL_THEMES[id as MobileFestival]
    : FESTIVAL_THEMES.none;
}

/** Admin-chosen greeting, or the festival's default. */
export function festivalGreeting(festival: MobileFestival, custom: string): string {
  return custom.trim() || FESTIVAL_THEMES[festival].greeting;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two #rrggbb colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// ───────────────────────── Scheduling (start / end dates) ─────────────────────────

/** India Standard Time is UTC+05:30 with no daylight saving. */
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Today's date in India as `YYYY-MM-DD`, independent of the device's time zone. */
export function istDateKey(nowMs: number = Date.now()): string {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** True for a real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30, 2026-13-01 …). */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** What decides whether a festival theme is showing right now. */
export interface FestivalSchedule {
  festival: MobileFestival;
  /** First day the theme shows (inclusive, IST). '' = no start limit. */
  festivalStart: string;
  /** Last day the theme shows (inclusive, IST). '' = no end limit. */
  festivalEnd: string;
}

export type FestivalScheduleStatus = 'off' | 'always' | 'upcoming' | 'active' | 'ended';

/**
 * Where the schedule stands today. With no dates the festival simply stays on until the
 * admin switches it off (this is how it worked before scheduling existed).
 */
export function festivalScheduleStatus(s: FestivalSchedule, nowMs: number = Date.now()): FestivalScheduleStatus {
  return festivalStatusOnDay(s, istDateKey(nowMs));
}

/** Same as {@link festivalScheduleStatus} for an explicit India date key (`YYYY-MM-DD`). */
export function festivalStatusOnDay(s: FestivalSchedule, today: string): FestivalScheduleStatus {
  if (s.festival === 'none') return 'off';
  const start = isValidDateKey(s.festivalStart) ? s.festivalStart : '';
  const end = isValidDateKey(s.festivalEnd) ? s.festivalEnd : '';
  if (start === '' && end === '') return 'always';
  if (start !== '' && today < start) return 'upcoming';
  if (end !== '' && today > end) return 'ended';
  return 'active';
}

/** Whether the festival look should be shown right now (or on the given India date). */
export function isFestivalActive(s: FestivalSchedule, nowMs: number = Date.now()): boolean {
  const st = festivalScheduleStatus(s, nowMs);
  return st === 'always' || st === 'active';
}

/** Whether the festival look is shown on an explicit India date key. */
export function isFestivalActiveOnDay(s: FestivalSchedule, today: string): boolean {
  const st = festivalStatusOnDay(s, today);
  return st === 'always' || st === 'active';
}

/** Message when the dates can't be saved, or null when fine. */
export function festivalScheduleError(start: string, end: string): string | null {
  if (start !== '' && !isValidDateKey(start)) return 'Start date is not a valid date';
  if (end !== '' && !isValidDateKey(end)) return 'End date is not a valid date';
  if (start !== '' && end !== '' && end < start) return 'End date must be on or after the start date';
  return null;
}

/** Milliseconds until the next midnight in India (so a running app can re-check the schedule). */
export function msUntilNextIstDay(nowMs: number = Date.now()): number {
  const DAY = 24 * 60 * 60 * 1000;
  return DAY - ((nowMs + IST_OFFSET_MS) % DAY);
}
