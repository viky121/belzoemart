import type { PartnerSuggestion } from '@belzo/shared';

/**
 * Order of partners offered when an admin assigns an order (BR-D13): partners whose zone covers
 * the order's pincode first, then online ones, then those with the fewest active jobs, then by
 * name and id so the order is always the same for the same input. Pure, so it is easy to test.
 */
export function rankSuggestions(list: readonly PartnerSuggestion[]): PartnerSuggestion[] {
  return [...list].sort(
    (a, b) =>
      Number(b.zoneMatch) - Number(a.zoneMatch) ||
      Number(b.isOnline) - Number(a.isOnline) ||
      a.activeJobs - b.activeJobs ||
      a.name.localeCompare(b.name, 'en') ||
      (a.partnerId < b.partnerId ? -1 : a.partnerId > b.partnerId ? 1 : 0),
  );
}

/** A partner can take another job only while below their limit (BR-D11). */
export function hasCapacity(p: { activeJobs: number; maxActiveJobs: number }): boolean {
  return p.activeJobs < p.maxActiveJobs;
}
