/**
 * Tolerant category resolution shared by the bulk Excel sheet (pure, no DB).
 *
 * The normalisation is the one the deprecated CSV `bulkUpsert` uses: an exact
 * slug wins; otherwise the category NAME or SLUG is matched ignoring case,
 * punctuation and "&" vs "and", so "tea-coffee", "Tea & Coffee" and
 * "tea-and-coffee" resolve to the same category. Names that exist in more than
 * one branch (e.g. "Ghee") are reported as ambiguous with the exact slugs.
 */

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  /** Optional; only `false` excludes a category from the name/normalised match. */
  isActive?: boolean;
}

export type CategoryMatch =
  | { ok: { id: string; name: string; slug: string } }
  | { error: string };

/** Lower-case, "&"/"and" folded away, everything but a-z0-9 removed. */
export function normCategoryKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

function pick(c: CategoryRef): { id: string; name: string; slug: string } {
  return { id: c.id, name: c.name, slug: c.slug };
}

/**
 * 1. exact slug (any isActive); 2. lower-cased exact slug; 3. normalised match
 * by slug or name among categories with `isActive !== false`. Messages and the
 * hint rule are identical to `ProductService.bulkUpsert`.
 */
export function matchCategory(input: string, all: readonly CategoryRef[]): CategoryMatch {
  const raw = input.trim();
  const exact =
    all.find((c) => c.slug === raw) ??
    (raw !== raw.toLowerCase() ? all.find((c) => c.slug === raw.toLowerCase()) : undefined);
  if (exact) return { ok: pick(exact) };

  const active = all.filter((c) => c.isActive !== false);
  const key = normCategoryKey(raw);
  const matches = key
    ? active.filter((c) => normCategoryKey(c.slug) === key || normCategoryKey(c.name) === key)
    : [];
  if (matches.length === 1) return { ok: pick(matches[0]!) };
  if (matches.length > 1) {
    return {
      error: `category "${raw}" is ambiguous — use one of: ${matches.map((m) => m.slug).join(', ')}`,
    };
  }
  const hints = key
    ? active
        .filter((c) => {
          const k = normCategoryKey(c.slug);
          return k.length > 2 && (k.includes(key) || key.includes(k));
        })
        .slice(0, 3)
        .map((c) => c.slug)
    : [];
  return {
    error: `unknown category "${raw}"` + (hints.length ? ` — did you mean: ${hints.join(', ')}?` : ''),
  };
}

/**
 * Sheet label per category id: its name when that name resolves back to the
 * same category, else its slug (ambiguous names, inactive categories, names
 * that collide with another category's slug).
 */
export function categoryLabels(all: readonly CategoryRef[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const c of all) {
    const m = matchCategory(c.name, all);
    labels.set(c.id, 'ok' in m && m.ok.id === c.id ? c.name : c.slug);
  }
  return labels;
}
