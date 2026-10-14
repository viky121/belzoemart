import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

interface CmsPage {
  slug: string;
  title: string;
  body: string;
}

/** Renders a CMS page (About, Contact, legal pages) — FR-10.7, FR-13.6. */
export default async function CmsPageRenderer({ params }: { params: { slug: string } }) {
  const page = await apiFetch<CmsPage>(`/cms/pages/${params.slug}`, { revalidate: 300 }).catch(() => null);
  if (!page) notFound();
  return (
    <article style={{ padding: '2rem 0', maxWidth: 760 }} data-testid={`cms-page-${page.slug}`}>
      <h1>{page.title}</h1>
      {page.body.split('\n').map((para, i) => (
        <p key={i}>{para}</p>
      ))}
    </article>
  );
}
