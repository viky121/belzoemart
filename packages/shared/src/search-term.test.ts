import { SEARCH_TERM_MAX, cleanSearchTerm, searchLogSchema } from './search-term';

describe('cleanSearchTerm', () => {
  it('trims, joins spaces and lowercases for counting but keeps the typed words', () => {
    expect(cleanSearchTerm('  Basmati   RICE ')).toEqual({ term: 'Basmati RICE', termNorm: 'basmati rice' });
  });
  it('counts different spellings of capitals as one keyword', () => {
    expect(cleanSearchTerm('Sugar')?.termNorm).toBe(cleanSearchTerm(' SUGAR ')?.termNorm);
  });
  it('drops control characters and new lines', () => {
    expect(cleanSearchTerm('su\u0000g\nar\t1kg')?.term).toBe('su g ar 1kg');
  });
  it('is not a search when it is empty or only one character', () => {
    expect(cleanSearchTerm('')).toBeNull();
    expect(cleanSearchTerm('  a ')).toBeNull();
    expect(cleanSearchTerm('\n\t')).toBeNull();
  });
  it('keeps two letters and non-Latin words', () => {
    expect(cleanSearchTerm('ऑयल')?.termNorm).toBe('ऑयल');
    expect(cleanSearchTerm('te')?.term).toBe('te');
  });
  it('cuts long input at 100 characters without splitting a character', () => {
    const out = cleanSearchTerm('😀'.repeat(150));
    expect(Array.from(out!.term)).toHaveLength(SEARCH_TERM_MAX);
  });
  it('rejects values that are not text', () => {
    expect(cleanSearchTerm(undefined)).toBeNull();
    expect(cleanSearchTerm(42)).toBeNull();
    expect(cleanSearchTerm({})).toBeNull();
  });
});

describe('searchLogSchema', () => {
  it('accepts a keyword and a source', () => {
    expect(searchLogSchema.safeParse({ q: 'sugar', source: 'web' }).success).toBe(true);
    expect(searchLogSchema.safeParse({ q: 'sugar', source: 'app' }).success).toBe(true);
  });
  it('rejects an unknown source, a missing keyword and a huge keyword', () => {
    expect(searchLogSchema.safeParse({ q: 'sugar', source: 'sms' }).success).toBe(false);
    expect(searchLogSchema.safeParse({ source: 'web' }).success).toBe(false);
    expect(searchLogSchema.safeParse({ q: 'x'.repeat(401), source: 'web' }).success).toBe(false);
  });
});
