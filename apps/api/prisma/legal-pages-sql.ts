/**
 * Prints SQL that loads the legal policy pages into an existing database:
 *
 *   npx ts-node prisma/legal-pages-sql.ts > legal-pages.sql
 *   psql ... -f legal-pages.sql
 *
 * - A page that doesn't exist yet is created (enabled).
 * - A page that still holds the original sample text is replaced.
 * - A page whose text an admin has changed is left alone (and reported as skipped).
 * Running it again changes nothing. It never touches `isActive`.
 */
import { LEGAL_PAGES } from './legal-content';

function dollar(tag: string, value: string): string {
  const marker = `$${tag}$`;
  if (value.includes(marker)) throw new Error(`Text contains ${marker}`);
  return `${marker}${value}${marker}`;
}

const out: string[] = ['BEGIN;'];
for (const p of LEGAL_PAGES) {
  const known = p.placeholders.map((t) => dollar('ph', t)).join(', ');
  const guard = known ? `WHERE cms_pages.body IN (${known})` : `WHERE false`;
  out.push(
    `INSERT INTO cms_pages (id, slug, title, body, "isActive", "updatedAt")`,
    `VALUES (gen_random_uuid()::text, ${dollar('sl', p.slug)}, ${dollar('ti', p.title)}, ${dollar('bd', p.body)}, true, now())`,
    `ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, "updatedAt" = now()`,
    `${guard}`,
    `RETURNING slug, 'loaded' AS result;`,
  );
}
out.push(`SELECT slug, title, "isActive", length(body) AS body_len FROM cms_pages ORDER BY slug;`, 'COMMIT;');
process.stdout.write(out.join('\n') + '\n');
