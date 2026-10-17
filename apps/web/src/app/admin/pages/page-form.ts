import { CMS_SLUG_RE, slugify } from '@belzo/shared';

export interface PageForm {
  slug: string;
  title: string;
  body: string;
  isActive: boolean;
}

export const EMPTY_PAGE: PageForm = { slug: '', title: '', body: '', isActive: true };

/** A URL slug suggested from a page title (lowercase, hyphens). */
export function suggestSlug(title: string): string {
  return slugify(title).slice(0, 80);
}

/**
 * Checks a page before it is sent. `existing` pages keep their slug (it is their
 * address); a new page needs a valid, unused one. Returns a message, or null when fine.
 */
export function validatePage(form: PageForm, opts: { isNew: boolean; takenSlugs: readonly string[] }): string | null {
  if (!form.title.trim()) return 'Give the page a title.';
  if (form.title.trim().length > 160) return 'The title is too long (160 characters at most).';
  if (opts.isNew) {
    const slug = form.slug.trim();
    if (!slug) return 'Give the page a web address (for example refund-policy).';
    if (!CMS_SLUG_RE.test(slug)) {
      return 'The web address can only use lowercase letters, numbers and single hyphens, like refund-policy.';
    }
    if (slug.length > 80) return 'The web address is too long (80 characters at most).';
    if (opts.takenSlugs.includes(slug)) return 'A page with this web address already exists.';
  }
  if (!form.body.trim()) return 'The page has no text yet.';
  if (form.body.length > 60_000) return 'The text is too long (60,000 characters at most).';
  return null;
}

/** Sends only what the API accepts. */
export function toPayload(form: PageForm) {
  return {
    slug: form.slug.trim(),
    title: form.title.trim(),
    body: form.body.trim(),
    isActive: form.isActive,
  };
}
