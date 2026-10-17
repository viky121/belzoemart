import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { CmsService } from './cms.service';

interface Row {
  slug: string;
  title: string;
  body: string;
  isActive: boolean;
}

/** In-memory stand-in for the cms_pages table. */
function make(initial: Row[] = []) {
  const rows = new Map(initial.map((r) => [r.slug, { ...r }]));
  const cmsPage = {
    findUnique: jest.fn(async ({ where: { slug } }: { where: { slug: string } }) => rows.get(slug) ?? null),
    findMany: jest.fn(async ({ where }: { where?: { isActive?: boolean } } = {}) =>
      [...rows.values()].filter((r) => where?.isActive === undefined || r.isActive === where.isActive),
    ),
    update: jest.fn(async ({ where: { slug }, data }: { where: { slug: string }; data: Partial<Row> }) => {
      const r = rows.get(slug)!;
      Object.assign(r, data);
      return { ...r };
    }),
    upsert: jest.fn(
      async ({
        where: { slug },
        update,
        create,
      }: {
        where: { slug: string };
        update: Partial<Row>;
        create: Row;
      }) => {
        const r = rows.get(slug);
        if (r) Object.assign(r, update);
        else rows.set(slug, { ...create });
        return { ...rows.get(slug)! };
      },
    ),
  };
  const svc = new CmsService({ cmsPage } as unknown as PrismaService);
  return { svc, rows };
}

const page = (over: Partial<Row> = {}): Row => ({ slug: 'terms', title: 'Terms', body: 'Old text', isActive: true, ...over });

describe('CmsService — public reads', () => {
  it('serves an enabled page', async () => {
    const { svc } = make([page()]);
    expect((await svc.getPage('terms')).title).toBe('Terms');
  });

  it('a disabled page is not found, so the website and app hide it', async () => {
    const { svc } = make([page({ isActive: false })]);
    await expect(svc.getPage('terms')).rejects.toThrow(NotFoundException);
  });

  it('an unknown page is not found', async () => {
    await expect(make().svc.getPage('nope')).rejects.toThrow(NotFoundException);
  });

  it('the public list leaves disabled pages out', async () => {
    const { svc } = make([page(), page({ slug: 'privacy', title: 'Privacy', isActive: false })]);
    expect((await svc.listPages()).map((p) => p.slug)).toEqual(['terms']);
  });
});

describe('CmsService — admin', () => {
  it('listAll includes disabled pages', async () => {
    const { svc } = make([page(), page({ slug: 'privacy', title: 'Privacy', isActive: false })]);
    expect((await svc.listAll()).map((p) => p.slug).sort()).toEqual(['privacy', 'terms']);
  });

  it('setActive hides and shows a page', async () => {
    const { svc, rows } = make([page()]);
    await svc.setActive('terms', false);
    expect(rows.get('terms')!.isActive).toBe(false);
    await svc.setActive('terms', true);
    expect(rows.get('terms')!.isActive).toBe(true);
  });

  it('setActive on a missing page is a 404', async () => {
    await expect(make().svc.setActive('nope', false)).rejects.toThrow(NotFoundException);
  });

  it('editing the text of a disabled page does NOT re-enable it', async () => {
    const { svc, rows } = make([page({ isActive: false })]);
    await svc.upsertPage({ slug: 'terms', title: 'Terms v2', body: 'New text' });
    expect(rows.get('terms')).toMatchObject({ title: 'Terms v2', body: 'New text', isActive: false });
  });

  it('a save can still set the flag explicitly', async () => {
    const { svc, rows } = make([page({ isActive: false })]);
    await svc.upsertPage({ slug: 'terms', title: 'Terms', body: 'x', isActive: true });
    expect(rows.get('terms')!.isActive).toBe(true);
  });

  it('a brand new page is enabled by default and gets a slug from its title', async () => {
    const { svc, rows } = make();
    await svc.upsertPage({ title: 'Refund Rules', body: 'text' });
    expect(rows.get('refund-rules')).toMatchObject({ title: 'Refund Rules', isActive: true });
    await svc.upsertPage({ slug: 'draft', title: 'Draft', body: 'x', isActive: false });
    expect(rows.get('draft')!.isActive).toBe(false);
  });
});
