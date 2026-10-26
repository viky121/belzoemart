import { resolveReportRange } from '@belzo/shared';
import { buildSearchTermsReport, SEARCH_PAGE_SIZE } from './reports-search';

/**
 * The SQL itself is checked against a real database in reports.db.spec.ts. Here: how the answers are
 * turned into cards, tables and pages, and what happens when there are no searches.
 */
const range = resolveReportRange('2026-10-20', '2026-10-24');

function make(answers: { totals?: unknown[]; top?: unknown[]; products?: unknown[]; miss?: unknown[]; days?: unknown[]; dayCount?: unknown[]; titles?: { id: string; title: string }[] }) {
  const queries: { text: string; values: unknown[] }[] = [];
  const prisma = {
    $queryRaw: jest.fn(async (sql: { sql: string; values: unknown[] }) => {
      queries.push({ text: sql.sql, values: sql.values });
      if (sql.sql.includes('GROUP BY "topProductId"')) return answers.products ?? [];
      if (sql.sql.includes('AS "topProductId"') && sql.sql.includes('GROUP BY "termNorm"')) return answers.top ?? [];
      if (sql.sql.includes('COUNT(DISTINCT "termNorm")::int AS keywords')) return answers.totals ?? [];
      if (sql.sql.includes('"resultCount" = 0\n      GROUP BY') || sql.sql.includes('MAX("createdAt") AS last')) return answers.miss ?? [];
      if (sql.sql.includes('SELECT COUNT(*)::int AS total')) return answers.dayCount ?? [];
      return answers.days ?? [];
    }),
    product: { findMany: jest.fn(async () => answers.titles ?? []) },
  };
  return { prisma, queries };
}

describe('buildSearchTermsReport', () => {
  it('has zero cards, empty tables and no product lookup when nobody searched', async () => {
    const { prisma } = make({});
    const r = await buildSearchTermsReport(prisma as never, range, 1, false);
    expect(r.id).toBe('search-terms');
    expect(r.cards.map((c) => [c.label, c.value])).toEqual([
      ['Searches', 0],
      ['Different keywords', 0],
      ['Searches with no result', 0],
      ['From the website', 0],
      ['From the app', 0],
    ]);
    expect(r.rows).toEqual([]);
    expect(r.tables?.every((t) => t.rows.length === 0 && !!t.empty)).toBe(true);
    expect(r.chart?.points).toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(r.page).toEqual({ page: 1, pageSize: SEARCH_PAGE_SIZE, total: 0, label: 'keyword rows' });
  });

  it('turns the answers into cards, a ranked chart, the three lists and the day by day rows', async () => {
    const { prisma } = make({
      totals: [{ searches: 10, keywords: 3, noResult: 2, web: 7, app: 3 }],
      top: [
        { term: 'sugar', searches: 6, web: 4, app: 2, found: 5, topProductId: 'p1' },
        { term: 'ghee', searches: 2, web: 1, app: 1, found: 0, topProductId: null },
        { term: 'oldtea', searches: 2, web: 2, app: 0, found: 1, topProductId: 'gone' },
      ],
      products: [{ id: 'p1', searches: 6, keywords: 2 }],
      miss: [{ term: 'ghee', searches: 2, last: new Date('2026-10-23T19:00:00Z') }],
      days: [{ day: '2026-10-24', term: 'sugar', searches: 3, web: 2, app: 1, found: 5, noResult: 0 }],
      dayCount: [{ total: 120 }],
      titles: [{ id: 'p1', title: 'Sugar 1 kg' }],
    });
    const r = await buildSearchTermsReport(prisma as never, range, 2, false);
    expect(r.cards.map((c) => c.value)).toEqual([10, 3, 2, 7, 3]);
    expect(r.cards[2]!.tone).toBe('warn');
    expect(r.chart).toMatchObject({ kind: 'int', layout: 'ranked', points: [{ label: 'sugar', value: 6 }, { label: 'ghee', value: 2 }, { label: 'oldtea', value: 2 }] });
    const [top, products, miss] = r.tables!;
    expect(top!.rows).toEqual([
      { rank: 1, term: 'sugar', searches: 6, web: 4, app: 2, found: 5, topProduct: 'Sugar 1 kg' },
      { rank: 2, term: 'ghee', searches: 2, web: 1, app: 1, found: 0, topProduct: null },
      { rank: 3, term: 'oldtea', searches: 2, web: 2, app: 0, found: 1, topProduct: 'Removed product' },
    ]);
    expect(products!.rows).toEqual([{ rank: 1, product: 'Sugar 1 kg', searches: 6, keywords: 2 }]);
    expect(miss!.rows).toEqual([{ term: 'ghee', searches: 2, last: '2026-10-24 00:30' }]);
    expect(r.rows).toEqual([{ date: '2026-10-24', term: 'sugar', searches: 3, web: 2, app: 1, found: 5, noResult: 0 }]);
    expect(r.tableTitle).toBe('Day by day');
    expect(r.page).toEqual({ page: 2, pageSize: 50, total: 120, label: 'keyword rows' });
  });

  it('pages the day by day list: 50 rows per page, newest day first', async () => {
    const { prisma, queries } = make({});
    await buildSearchTermsReport(prisma as never, range, 3, false);
    const day = queries.find((q) => q.text.includes('LIMIT') && q.text.includes('OFFSET'))!;
    expect(day.text).toContain('ORDER BY day DESC');
    expect(day.values.slice(-2)).toEqual([50, 100]);
  });

  it('a CSV download has no page and starts at the first row', async () => {
    const { prisma, queries } = make({});
    const r = await buildSearchTermsReport(prisma as never, range, 7, true);
    expect(r.page).toBeUndefined();
    const day = queries.find((q) => q.text.includes('OFFSET'))!;
    expect(day.values.slice(-2)).toEqual([20_000, 0]);
  });

  it('reads only the chosen period', async () => {
    const { prisma, queries } = make({});
    await buildSearchTermsReport(prisma as never, range, 1, false);
    for (const q of queries) {
      expect(q.values).toEqual(expect.arrayContaining([range.start, range.end]));
    }
  });
});
