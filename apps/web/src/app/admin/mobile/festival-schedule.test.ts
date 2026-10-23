import { prettyDate, scheduleSummary } from './festival-schedule';

const at = (iso: string) => new Date(iso).getTime();
const v = (festival: 'diwali' | 'none', festivalStart: string, festivalEnd: string) => ({
  festival,
  festivalStart,
  festivalEnd,
});

describe('prettyDate', () => {
  it('formats a calendar date without shifting the day', () => {
    expect(prettyDate('2026-11-08')).toBe('8 Nov 2026');
    expect(prettyDate('2026-01-01')).toBe('1 Jan 2026');
  });
});

describe('scheduleSummary', () => {
  const now = at('2026-11-10T06:00:00Z'); // 10 Nov, 11:30 IST

  it('says there is no theme when none is chosen', () => {
    expect(scheduleSummary(v('none', '', ''), now)).toMatchObject({ tone: 'ok', text: expect.stringMatching(/normal look/) });
  });

  it('explains that no dates means it stays on', () => {
    expect(scheduleSummary(v('diwali', '', ''), now).text).toMatch(/stays on until you switch it off/);
  });

  it('says when it will start (upcoming)', () => {
    const s = scheduleSummary(v('diwali', '2026-11-12', '2026-11-15'), now);
    expect(s.tone).toBe('warn');
    expect(s.text).toMatch(/starts on 12 Nov 2026/);
  });

  it('says it is live and when it switches off', () => {
    const s = scheduleSummary(v('diwali', '2026-11-08', '2026-11-12'), now);
    expect(s.tone).toBe('ok');
    expect(s.text).toMatch(/Live now.*after 12 Nov 2026/);
  });

  it('says it has ended', () => {
    const s = scheduleSummary(v('diwali', '2026-11-01', '2026-11-05'), now);
    expect(s.tone).toBe('warn');
    expect(s.text).toMatch(/Ended on 5 Nov 2026/);
  });

  it('flags an end date before the start date', () => {
    const s = scheduleSummary(v('diwali', '2026-11-12', '2026-11-08'), now);
    expect(s.tone).toBe('bad');
    expect(s.text).toMatch(/on or after/);
  });
});
