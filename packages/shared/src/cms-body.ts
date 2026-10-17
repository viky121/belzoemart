/**
 * Page bodies are plain text so they are easy to edit in the admin panel. A few
 * line-start markers give them structure on every screen (web and mobile):
 *
 *   ## Heading        a section heading
 *   - item            a bullet point (also "• item")
 *   anything else     a paragraph
 *
 * Blank lines are ignored. Bodies written before these markers existed are just
 * paragraphs, so nothing changes for them.
 */
export type CmsBlock =
  | { type: 'heading'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'paragraph'; text: string };

export function parseCmsBody(body: string): CmsBlock[] {
  const blocks: CmsBlock[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', text: heading[1]! });
      continue;
    }
    const bullet = /^(?:-|\u2022|\*)\s+(.*\S)\s*$/.exec(line);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1]! });
      continue;
    }
    blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}

/** A page URL slug: lowercase letters, digits and single hyphens. */
export const CMS_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
