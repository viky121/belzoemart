import { z } from 'zod';

/**
 * Search terms (Admin Reports > Search terms). A customer's search is saved only when it is a real
 * search (Enter, a tapped suggestion, the results page), never while the words are still being typed.
 */
export const SEARCH_SOURCES = ['web', 'app'] as const;
export type SearchSource = (typeof SEARCH_SOURCES)[number];

export const SEARCH_TERM_MIN = 2;
export const SEARCH_TERM_MAX = 100;

/** The body the website and the app send after a real search. */
export const searchLogSchema = z.object({
  q: z.string().max(400),
  source: z.enum(SEARCH_SOURCES),
});
export type SearchLogInput = z.infer<typeof searchLogSchema>;

export interface CleanSearchTerm {
  /** As the customer typed it, spaces tidied and cut at 100 characters. */
  term: string;
  /** Lowercase, used to count "Sugar", "sugar" and " SUGAR " as one keyword. */
  termNorm: string;
}

/**
 * Tidies a search: control characters are dropped, runs of spaces become one, the ends are trimmed
 * and the length is capped. Returns null when what is left is too short to be a search.
 */
export function cleanSearchTerm(raw: unknown): CleanSearchTerm | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const tidy = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (tidy.length < SEARCH_TERM_MIN) return null;
  const term = Array.from(tidy).slice(0, SEARCH_TERM_MAX).join('').trim();
  if (term.length < SEARCH_TERM_MIN) return null;
  return { term, termNorm: term.toLowerCase() };
}
