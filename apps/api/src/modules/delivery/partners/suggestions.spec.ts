import fc from 'fast-check';
import type { PartnerSuggestion } from '@belzo/shared';
import { hasCapacity, rankSuggestions } from './suggestions';

const s = (over: Partial<PartnerSuggestion>): PartnerSuggestion => ({
  partnerId: 'p',
  name: 'N',
  isOnline: false,
  activeJobs: 0,
  maxActiveJobs: 10,
  zoneMatch: false,
  ...over,
});

const arbSuggestion: fc.Arbitrary<PartnerSuggestion> = fc.record({
  partnerId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 12 }),
  isOnline: fc.boolean(),
  activeJobs: fc.integer({ min: 0, max: 12 }),
  maxActiveJobs: fc.integer({ min: 1, max: 12 }),
  zoneMatch: fc.boolean(),
});

describe('rankSuggestions (example tests)', () => {
  it('puts zone matches first, then online, then fewest jobs, then name', () => {
    const ranked = rankSuggestions([
      s({ partnerId: '1', name: 'D', activeJobs: 0 }),
      s({ partnerId: '2', name: 'C', isOnline: true, activeJobs: 5 }),
      s({ partnerId: '3', name: 'B', zoneMatch: true, activeJobs: 9 }),
      s({ partnerId: '4', name: 'A', isOnline: true, activeJobs: 1 }),
    ]);
    expect(ranked.map((x) => x.partnerId)).toEqual(['3', '4', '2', '1']);
  });

  it('does not change the input array', () => {
    const input = [s({ partnerId: '2', name: 'B' }), s({ partnerId: '1', name: 'A' })];
    const copy = [...input];
    rankSuggestions(input);
    expect(input).toEqual(copy);
  });

  it('knows who has capacity', () => {
    expect(hasCapacity({ activeJobs: 9, maxActiveJobs: 10 })).toBe(true);
    expect(hasCapacity({ activeJobs: 10, maxActiveJobs: 10 })).toBe(false);
  });
});

describe('rankSuggestions (property tests)', () => {
  it('P13: the result is a permutation of the input', () => {
    fc.assert(
      fc.property(fc.array(arbSuggestion, { maxLength: 30 }), (list) => {
        const ranked = rankSuggestions(list);
        expect(ranked).toHaveLength(list.length);
        expect([...ranked].map((x) => x.partnerId).sort()).toEqual([...list].map((x) => x.partnerId).sort());
      }),
    );
  });

  it('P13: zone-matching partners always come before the others', () => {
    fc.assert(
      fc.property(fc.array(arbSuggestion, { maxLength: 30 }), (list) => {
        const ranked = rankSuggestions(list);
        const firstOther = ranked.findIndex((x) => !x.zoneMatch);
        if (firstOther >= 0) expect(ranked.slice(firstOther).every((x) => !x.zoneMatch)).toBe(true);
      }),
    );
  });

  it('P13: the order does not depend on the input order (deterministic)', () => {
    fc.assert(
      fc.property(fc.array(arbSuggestion, { maxLength: 30 }), fc.integer(), (list, seed) => {
        const shuffled = [...list].sort((a, b) => ((a.partnerId + seed).length % 3) - ((b.partnerId + seed).length % 3) || (a.partnerId < b.partnerId ? 1 : -1));
        expect(rankSuggestions(shuffled).map((x) => x.partnerId)).toEqual(rankSuggestions(list).map((x) => x.partnerId));
      }),
    );
  });
});
