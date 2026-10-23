import { festivalScheduleError, festivalScheduleStatus, type MobileHome } from '@belzo/shared';

export type FestivalFields = Pick<
  MobileHome,
  'festival' | 'festivalGreeting' | 'festivalDecor' | 'festivalStart' | 'festivalEnd'
>;

/** `2026-11-08` → `8 Nov 2026` (no time-zone shifting: the value is a plain calendar date). */
export function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** One plain-language line saying whether the theme is showing today. */
export function scheduleSummary(
  v: Pick<FestivalFields, 'festival' | 'festivalStart' | 'festivalEnd'>,
  nowMs: number = Date.now(),
): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  const err = festivalScheduleError(v.festivalStart, v.festivalEnd);
  if (err) return { text: err, tone: 'bad' };
  const status = festivalScheduleStatus(
    { festival: v.festival, festivalStart: v.festivalStart, festivalEnd: v.festivalEnd },
    nowMs,
  );
  switch (status) {
    case 'off':
      return { text: 'No festival theme. The app shows its normal look.', tone: 'ok' };
    case 'always':
      return { text: 'No dates set: the theme stays on until you switch it off.', tone: 'ok' };
    case 'upcoming':
      return {
        text: `Not live yet. It starts on ${prettyDate(v.festivalStart)} and the app switches by itself.`,
        tone: 'warn',
      };
    case 'ended':
      return { text: `Ended on ${prettyDate(v.festivalEnd)}. The app is back to its normal look.`, tone: 'warn' };
    case 'active':
      return {
        text: v.festivalEnd
          ? `Live now. It switches off by itself after ${prettyDate(v.festivalEnd)}.`
          : 'Live now.',
        tone: 'ok',
      };
  }
}
