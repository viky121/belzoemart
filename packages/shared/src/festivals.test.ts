import {
  FESTIVAL_MOTIFS,
  FESTIVAL_THEMES,
  MOBILE_FESTIVALS,
  MOTIF_EMOJI,
  contrastRatio,
  festivalGreeting,
  getFestivalTheme,
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
