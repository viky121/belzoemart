/**
 * Short product name for small places (search suggestions, compact lists).
 *
 * Catalogue titles often carry an SEO tail after a pipe, for example
 * "Pears Original Glycerin Bar 100g | Bathing Soap Bar". Only the part before the first " | " is the
 * product name, so that is what small lists show. A title with no pipe is returned as it is, and a
 * title that would become empty keeps its full text. The product page still shows the full title.
 */
export function shortProductTitle(title: string): string {
  const full = title.replace(/\s+/g, ' ').trim();
  const cut = full.indexOf(' | ');
  if (cut <= 0) return full;
  const head = full.slice(0, cut).trim();
  return head.length > 0 ? head : full;
}
