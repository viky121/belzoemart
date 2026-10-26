import { Prisma } from '@prisma/client';
import type { ReportCard, ReportRange, ReportResponse } from '@belzo/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';

/** Rows in the keyword and product lists, and rows on one page of the day by day list. */
export const SEARCH_TOP_ROWS = 20;
export const SEARCH_PAGE_SIZE = 50;
/** The CSV file holds at most this many day by day rows. */
const SEARCH_CSV_ROWS = 20_000;

const count = (label: string, value: number, extra: Partial<ReportCard> = {}): ReportCard => ({ label, value, kind: 'int', ...extra });

/** `2026-10-24 15:30` in India time. */
function istMinute(d: Date): string {
  return new Date(d.getTime() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Search terms report: what customers searched for (the search log), the keywords searched most, the
 * products that came up first most often, keywords that found nothing, and a day by day list (one row
 * per keyword per India day). The day and the counts are worked out in the database with SQL.
 */
export async function buildSearchTermsReport(
  prisma: Pick<PrismaService, '$queryRaw' | 'product'>,
  range: ReportRange,
  page: number,
  all: boolean,
): Promise<ReportResponse> {
  const within = Prisma.sql`"createdAt" >= ${range.start} AND "createdAt" <= ${range.end}`;
  const limit = all ? SEARCH_CSV_ROWS : SEARCH_PAGE_SIZE;
  const offset = all ? 0 : (Math.max(1, page) - 1) * SEARCH_PAGE_SIZE;

  const [totalRows, topRows, productRows, missRows, dayRows, dayCount] = await Promise.all([
    prisma.$queryRaw<{ searches: number; keywords: number; noResult: number; web: number; app: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS searches,
             COUNT(DISTINCT "termNorm")::int AS keywords,
             (COUNT(*) FILTER (WHERE "resultCount" = 0))::int AS "noResult",
             (COUNT(*) FILTER (WHERE source = 'web'))::int AS web,
             (COUNT(*) FILTER (WHERE source = 'app'))::int AS app
      FROM search_logs WHERE ${within}`),
    prisma.$queryRaw<{ term: string; searches: number; web: number; app: number; found: number; topProductId: string | null }[]>(Prisma.sql`
      SELECT "termNorm" AS term,
             COUNT(*)::int AS searches,
             (COUNT(*) FILTER (WHERE source = 'web'))::int AS web,
             (COUNT(*) FILTER (WHERE source = 'app'))::int AS app,
             (array_agg("resultCount" ORDER BY "createdAt" DESC))[1] AS found,
             (array_agg("topProductId" ORDER BY "createdAt" DESC) FILTER (WHERE "topProductId" IS NOT NULL))[1] AS "topProductId"
      FROM search_logs WHERE ${within}
      GROUP BY "termNorm"
      ORDER BY searches DESC, "termNorm" ASC
      LIMIT ${SEARCH_TOP_ROWS}`),
    prisma.$queryRaw<{ id: string; searches: number; keywords: number }[]>(Prisma.sql`
      SELECT "topProductId" AS id, COUNT(*)::int AS searches, COUNT(DISTINCT "termNorm")::int AS keywords
      FROM search_logs WHERE ${within} AND "topProductId" IS NOT NULL
      GROUP BY "topProductId"
      ORDER BY searches DESC, "topProductId" ASC
      LIMIT ${SEARCH_TOP_ROWS}`),
    prisma.$queryRaw<{ term: string; searches: number; last: Date }[]>(Prisma.sql`
      SELECT "termNorm" AS term, COUNT(*)::int AS searches, MAX("createdAt") AS last
      FROM search_logs WHERE ${within} AND "resultCount" = 0
      GROUP BY "termNorm"
      ORDER BY searches DESC, "termNorm" ASC
      LIMIT ${SEARCH_TOP_ROWS}`),
    prisma.$queryRaw<{ day: string; term: string; searches: number; web: number; app: number; found: number; noResult: number }[]>(Prisma.sql`
      SELECT to_char("createdAt" + interval '5 hours 30 minutes', 'YYYY-MM-DD') AS day,
             "termNorm" AS term,
             COUNT(*)::int AS searches,
             (COUNT(*) FILTER (WHERE source = 'web'))::int AS web,
             (COUNT(*) FILTER (WHERE source = 'app'))::int AS app,
             (array_agg("resultCount" ORDER BY "createdAt" DESC))[1] AS found,
             (COUNT(*) FILTER (WHERE "resultCount" = 0))::int AS "noResult"
      FROM search_logs WHERE ${within}
      GROUP BY 1, "termNorm"
      ORDER BY day DESC, searches DESC, "termNorm" ASC
      LIMIT ${limit} OFFSET ${offset}`),
    prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total FROM (
        SELECT 1 FROM search_logs WHERE ${within}
        GROUP BY to_char("createdAt" + interval '5 hours 30 minutes', 'YYYY-MM-DD'), "termNorm"
      ) d`),
  ]);

  const totals = totalRows[0] ?? { searches: 0, keywords: 0, noResult: 0, web: 0, app: 0 };
  const dayTotal = dayCount[0]?.total ?? 0;

  const ids = [...new Set([...topRows.map((r) => r.topProductId), ...productRows.map((r) => r.id)].filter((x): x is string => !!x))];
  const found = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }) : [];
  const titles = new Map<string, string>(found.map((p) => [p.id, p.title]));
  const titleOf = (id: string | null) => (id ? (titles.get(id) ?? 'Removed product') : null);

  const notes = [
    'Only real searches are counted: Enter, the search button, a tapped suggestion or the results page. Words half typed are not saved.',
    'A keyword is counted without capital letters and extra spaces. The same person searching the same words twice within 30 seconds counts once.',
    '"Products found" is what the shop had the last time the keyword was searched. "No result" counts the searches that found nothing.',
    'A product counts in "Most searched products" each time it is the first result of a search.',
    'Searches are kept for 12 months. The CSV file has the day by day list.',
  ];
  if (all && dayTotal > limit) notes.push(`The file has the first ${limit} rows. Pick a shorter period to get the rest.`);

  return {
    id: 'search-terms',
    title: 'Search terms',
    range: { from: range.from, to: range.to },
    cards: [
      count('Searches', totals.searches),
      count('Different keywords', totals.keywords),
      count('Searches with no result', totals.noResult, { tone: totals.noResult > 0 ? 'warn' : undefined }),
      count('From the website', totals.web),
      count('From the app', totals.app),
    ],
    chart: {
      title: 'Most searched keywords, top 10',
      kind: 'int',
      layout: 'ranked',
      points: topRows.slice(0, 10).map((r) => ({ label: r.term, value: r.searches })),
    },
    tables: [
      {
        title: 'Top keywords',
        empty: 'No searches in this period.',
        columns: [
          { key: 'rank', label: '#', kind: 'int' },
          { key: 'term', label: 'Keyword', kind: 'text' },
          { key: 'searches', label: 'Times searched', kind: 'int' },
          { key: 'web', label: 'Website', kind: 'int' },
          { key: 'app', label: 'App', kind: 'int' },
          { key: 'found', label: 'Products found', kind: 'int' },
          { key: 'topProduct', label: 'Found first', kind: 'text' },
        ],
        rows: topRows.map((r, i) => ({
          rank: i + 1,
          term: r.term,
          searches: r.searches,
          web: r.web,
          app: r.app,
          found: r.found,
          topProduct: titleOf(r.topProductId),
        })),
      },
      {
        title: 'Most searched products',
        empty: 'No product came up first in this period.',
        columns: [
          { key: 'rank', label: '#', kind: 'int' },
          { key: 'product', label: 'Product', kind: 'text' },
          { key: 'searches', label: 'Times first result', kind: 'int' },
          { key: 'keywords', label: 'Different keywords', kind: 'int' },
        ],
        rows: productRows.map((r, i) => ({ rank: i + 1, product: titleOf(r.id), searches: r.searches, keywords: r.keywords })),
      },
      {
        title: 'Not found: searches with no product',
        empty: 'Every search found at least one product.',
        columns: [
          { key: 'term', label: 'Keyword', kind: 'text' },
          { key: 'searches', label: 'Times searched', kind: 'int' },
          { key: 'last', label: 'Last searched (India time)', kind: 'text' },
        ],
        rows: missRows.map((r) => ({ term: r.term, searches: r.searches, last: istMinute(new Date(r.last)) })),
      },
    ],
    tableTitle: 'Day by day',
    columns: [
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'term', label: 'Keyword', kind: 'text' },
      { key: 'searches', label: 'Times searched', kind: 'int' },
      { key: 'web', label: 'Website', kind: 'int' },
      { key: 'app', label: 'App', kind: 'int' },
      { key: 'found', label: 'Products found', kind: 'int' },
      { key: 'noResult', label: 'No result', kind: 'int' },
    ],
    rows: dayRows.map((r) => ({ date: r.day, term: r.term, searches: r.searches, web: r.web, app: r.app, found: r.found, noResult: r.noResult })),
    page: all ? undefined : { page: Math.max(1, page), pageSize: SEARCH_PAGE_SIZE, total: dayTotal, label: 'keyword rows' },
    notes,
  };
}
