import {
  FESTIVAL_MOTIFS,
  FESTIVAL_THEMES,
  MOBILE_FESTIVALS,
  MOTIF_EMOJI,
  contrastRatio,
  festivalGreeting,
  festivalScheduleError,
  festivalScheduleStatus,
  getFestivalTheme,
  isFestivalActive,
  isFestivalActiveOnDay,
  isValidDateKey,
  istDateKey,
  msUntilNextIstDay,
} from './festivals';
import { DEFAULT_MOBILE_HOME, mobileHomeSchema, sanitizeMobileHome } from './mobile-home';

const REQUESTED = [
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
];

const HEX = /^#[0-9a-f]{6}$/i;

describe('festival catalogue', () => {
  it('covers every requested festival plus "none"', () => {
    expect([...MOBILE_FESTIVALS].sort()).toEqual(['none', ...REQUESTED].sort());
    expect(Object.keys(FESTIVAL_THEMES).sort()).toEqual([...MOBILE_FESTIVALS].sort());
  });

  it.each(MOBILE_FESTIVALS)('%s: id matches key, colours are valid hex, motifs are known', (id) => {
    const t = FESTIVAL_THEMES[id];
    expect(t.id).toBe(id);
    for (const c of [t.primary, t.primaryBg, t.headerFrom, t.headerTo, t.accent, ...t.tints]) {
      expect(c).toMatch(HEX);
    }
    for (const m of t.motifs) {
      expect(FESTIVAL_MOTIFS).toContain(m);
      expect(MOTIF_EMOJI[m]).toBeTruthy();
    }
    expect(t.tints.length).toBeGreaterThanOrEqual(6);
  });

  it.each(MOBILE_FESTIVALS)('%s: white text is readable (WCAG AA 4.5:1) on buttons and the header', (id) => {
    const t = FESTIVAL_THEMES[id];
    expect(contrastRatio('#ffffff', t.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', t.headerFrom)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', t.headerTo)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(REQUESTED)('%s: has a greeting, a regional line and decorations', (id) => {
    const t = getFestivalTheme(id);
    expect(t.greeting.length).toBeGreaterThan(3);
    expect(t.greetingLocal.length).toBeGreaterThan(3);
    expect(t.motifs.length).toBeGreaterThanOrEqual(3);
  });

  it('every festival is visually distinct (no two share header + primary)', () => {
    const keys = REQUESTED.map((id) => {
      const t = FESTIVAL_THEMES[id as keyof typeof FESTIVAL_THEMES];
      return `${t.primary}|${t.headerFrom}|${t.headerTo}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('helpers', () => {
  it('getFestivalTheme falls back to the default theme for unknown input', () => {
    expect(getFestivalTheme('christmas').id).toBe('none');
    expect(getFestivalTheme(undefined).id).toBe('none');
    expect(getFestivalTheme(42).id).toBe('none');
  });
  it('festivalGreeting prefers the custom text, else the default', () => {
    expect(festivalGreeting('diwali', '')).toBe('Happy Diwali');
    expect(festivalGreeting('diwali', '  Shubh Deepawali  ')).toBe('Shubh Deepawali');
    expect(festivalGreeting('none', '')).toBe('');
  });
  it('contrastRatio matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('festival fields in the mobile home config', () => {
  it('defaults to no festival with decorations on', () => {
    const d = mobileHomeSchema.parse({});
    expect([d.festival, d.festivalGreeting, d.festivalDecor]).toEqual(['none', '', true]);
    expect(DEFAULT_MOBILE_HOME.festival).toBe('none');
  });
  it('accepts every festival and rejects an unknown one (strict, admin save)', () => {
    for (const f of MOBILE_FESTIVALS) expect(mobileHomeSchema.safeParse({ festival: f }).success).toBe(true);
    expect(mobileHomeSchema.safeParse({ festival: 'christmas' }).success).toBe(false);
  });
  it('sanitize keeps a valid festival and degrades an unknown one to none without losing other settings', () => {
    expect(sanitizeMobileHome({ festival: 'holi', festivalGreeting: 'Holi Hai!', festivalDecor: false })).toMatchObject({
      festival: 'holi',
      festivalGreeting: 'Holi Hai!',
      festivalDecor: false,
    });
    const bad = sanitizeMobileHome({ festival: 'christmas', dealsEnabled: false });
    expect(bad.festival).toBe('none');
    expect(bad.dealsEnabled).toBe(false);
  });
  it('rejects an over-long greeting on save but trims it on read', () => {
    expect(mobileHomeSchema.safeParse({ festivalGreeting: 'x'.repeat(61) }).success).toBe(false);
    expect(sanitizeMobileHome({ festivalGreeting: 'x'.repeat(61) }).festivalGreeting).toBe('');
  });
});

describe('festival schedule (India dates)', () => {
  // 2026-11-08 10:00 IST (= 04:30 UTC)
  const at = (iso: string) => new Date(iso).getTime();
  const s = (festivalStart: string, festivalEnd: string, festival: 'diwali' | 'none' = 'diwali') => ({
    festival,
    festivalStart,
    festivalEnd,
  });

  it('istDateKey follows India time, not UTC', () => {
    // 23:00 UTC on the 7th is already 04:30 IST on the 8th.
    expect(istDateKey(at('2026-11-07T23:00:00Z'))).toBe('2026-11-08');
    // 18:29 UTC is 23:59 IST: still the 7th. 18:30 UTC is midnight IST: the 8th.
    expect(istDateKey(at('2026-11-07T18:29:00Z'))).toBe('2026-11-07');
    expect(istDateKey(at('2026-11-07T18:30:00Z'))).toBe('2026-11-08');
  });

  it('isValidDateKey accepts real dates only', () => {
    expect(isValidDateKey('2026-11-08')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '08-11-2026', '', 'abc', null, 20261108]) {
      expect(isValidDateKey(bad)).toBe(false);
    }
  });

  it('with no dates a chosen festival stays on (the pre-scheduling behaviour)', () => {
    expect(festivalScheduleStatus(s('', ''), at('2030-01-01T00:00:00Z'))).toBe('always');
    expect(isFestivalActive(s('', ''))).toBe(true);
  });

  it('"none" is never active, whatever the dates', () => {
    expect(isFestivalActive(s('2026-01-01', '2026-12-31', 'none'), at('2026-06-01T00:00:00Z'))).toBe(false);
    expect(festivalScheduleStatus(s('', '', 'none'))).toBe('off');
  });

  it('is upcoming before the start, active on both boundary days, ended after the end', () => {
    const sch = s('2026-11-08', '2026-11-12');
    expect(festivalScheduleStatus(sch, at('2026-11-07T18:29:00Z'))).toBe('upcoming'); // 7th 23:59 IST
    expect(festivalScheduleStatus(sch, at('2026-11-07T18:30:00Z'))).toBe('active'); // 8th 00:00 IST
    expect(festivalScheduleStatus(sch, at('2026-11-12T18:29:00Z'))).toBe('active'); // 12th 23:59 IST
    expect(festivalScheduleStatus(sch, at('2026-11-12T18:30:00Z'))).toBe('ended'); // 13th 00:00 IST
    expect(isFestivalActive(sch, at('2026-11-10T06:00:00Z'))).toBe(true);
    expect(isFestivalActive(sch, at('2026-11-20T06:00:00Z'))).toBe(false);
  });

  it('supports an open start (ends on a date) and an open end (starts on a date)', () => {
    expect(isFestivalActive(s('', '2026-11-12'), at('2026-01-01T00:00:00Z'))).toBe(true);
    expect(isFestivalActive(s('', '2026-11-12'), at('2026-11-20T00:00:00Z'))).toBe(false);
    expect(isFestivalActive(s('2026-11-08', ''), at('2026-11-01T00:00:00Z'))).toBe(false);
    expect(isFestivalActive(s('2026-11-08', ''), at('2030-01-01T00:00:00Z'))).toBe(true);
  });

  it('evaluates against an explicit India date and reports the time until the next IST midnight', () => {
    const sch = s('2026-11-08', '2026-11-12');
    expect(isFestivalActiveOnDay(sch, '2026-11-07')).toBe(false);
    expect(isFestivalActiveOnDay(sch, '2026-11-08')).toBe(true);
    expect(isFestivalActiveOnDay(sch, '2026-11-12')).toBe(true);
    expect(isFestivalActiveOnDay(sch, '2026-11-13')).toBe(false);
    // 18:00 UTC = 23:30 IST → 30 minutes to midnight.
    expect(msUntilNextIstDay(at('2026-11-07T18:00:00Z'))).toBe(30 * 60 * 1000);
    // Exactly at IST midnight a full day remains.
    expect(msUntilNextIstDay(at('2026-11-07T18:30:00Z'))).toBe(24 * 60 * 60 * 1000);
  });

  it('treats a corrupt stored date as "no limit" instead of hiding the festival', () => {
    expect(isFestivalActive(s('garbage', ''), at('2026-11-01T00:00:00Z'))).toBe(true);
  });

  it('festivalScheduleError rejects bad or reversed dates', () => {
    expect(festivalScheduleError('', '')).toBeNull();
    expect(festivalScheduleError('2026-11-08', '2026-11-08')).toBeNull();
    expect(festivalScheduleError('2026-11-08', '')).toBeNull();
    expect(festivalScheduleError('2026-11-12', '2026-11-08')).toMatch(/on or after/);
    expect(festivalScheduleError('2026-02-30', '')).toMatch(/Start date/);
    expect(festivalScheduleError('', 'nope')).toMatch(/End date/);
  });

  it('the config schema stores the dates, defaults them to empty, and sanitize drops bad ones', () => {
    expect(mobileHomeSchema.parse({}).festivalStart).toBe('');
    expect(mobileHomeSchema.parse({ festivalStart: ' 2026-11-08 ', festivalEnd: '2026-11-12' })).toMatchObject({
      festivalStart: '2026-11-08',
      festivalEnd: '2026-11-12',
    });
    expect(mobileHomeSchema.safeParse({ festivalStart: '2026-02-30' }).success).toBe(false);
    const clean = sanitizeMobileHome({ festival: 'holi', festivalStart: 'x', festivalEnd: '2026-03-05' });
    expect(clean).toMatchObject({ festival: 'holi', festivalStart: '', festivalEnd: '2026-03-05' });
    expect(DEFAULT_MOBILE_HOME).toMatchObject({ festivalStart: '', festivalEnd: '' });
  });
});
