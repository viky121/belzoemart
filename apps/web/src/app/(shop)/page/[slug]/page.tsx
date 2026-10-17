import { notFound } from 'next/navigation';
import { parseCmsBody, type CmsBlock } from '@belzo/shared';
import { apiFetch } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

interface CmsPage {
  slug: string;
  title: string;
  body: string;
}

/** Group consecutive bullets into one list so screen readers announce a real list. */
function groupBlocks(blocks: CmsBlock[]): ({ kind: 'heading' | 'paragraph'; text: string } | { kind: 'list'; items: string[] })[] {
  const out: ReturnType<typeof groupBlocks> = [];
  for (const b of blocks) {
    if (b.type === 'bullet') {
      const last = out[out.length - 1];
      if (last && last.kind === 'list') last.items.push(b.text);
      else out.push({ kind: 'list', items: [b.text] });
    } else {
      out.push({ kind: b.type, text: b.text });
    }
  }
  return out;
}

/**
 * Renders a CMS page (About, Contact, legal policies) — FR-10.7, FR-13.6.
 * A page an admin has disabled is answered with 404 by the API, so it shows the
 * normal "not found" page. Text is rendered as plain text (never as HTML).
 */
export default async function CmsPageRenderer({ params }: { params: { slug: string } }) {
  const page = await apiFetch<CmsPage>(`/cms/pages/${encodeURIComponent(params.slug)}`).catch(() => null);
  if (!page) notFound();
  const blocks = groupBlocks(parseCmsBody(page.body));
  return (
    <article className="cms-page" data-testid={`cms-page-${page.slug}`}>
      <h1>{page.title}</h1>
      {blocks.map((b, i) =>
        b.kind === 'heading' ? (
          <h2 key={i}>{b.text}</h2>
        ) : b.kind === 'list' ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </article>
  );
}
