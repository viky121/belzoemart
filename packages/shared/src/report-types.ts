/**
 * Shapes of the admin report responses. The API builds every report in this one shape (cards, an
 * optional chart, columns and rows), so the admin page can show any report with the same
 * components and the CSV export uses the same columns.
 */
export const REPORT_IDS = [
  'sales',
  'orders',
  'users',
  'products',
  'categories',
  'brands',
  'best-sellers',
  'payments',
  'search-terms',
  'profit-loss',
] as const;
export type ReportId = (typeof REPORT_IDS)[number];

/** Reports that show cost and profit: Super Admin only. */
export const SUPER_ADMIN_REPORTS: readonly ReportId[] = ['profit-loss'];

export type ReportValueKind = 'money' | 'int' | 'pct' | 'text' | 'date' | 'status';

export interface ReportColumn {
  key: string;
  label: string;
  kind: ReportValueKind;
}

export interface ReportCard {
  label: string;
  value: number | string | null;
  kind: ReportValueKind;
  hint?: string;
  tone?: 'good' | 'bad' | 'warn';
}

export interface ReportChartPoint {
  label: string;
  value: number;
  /** Optional second measure shown as a line label (e.g. orders next to revenue). */
  extra?: number;
}

export interface ReportChart {
  title: string;
  kind: 'money' | 'int';
  points: ReportChartPoint[];
  /** `ranked` always draws a ranked list of bars (names), never day columns. */
  layout?: 'ranked';
}

export type ReportCell = string | number | null;

export interface ReportPage {
  page: number;
  pageSize: number;
  total: number;
  /** What the rows are, for the pager text ("orders" when missing). */
  label?: string;
}

/** An extra small table shown above the main one (for example "Top keywords"). */
export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  /** Shown instead of the table when there are no rows. */
  empty?: string;
}

export interface ReportResponse {
  id: ReportId;
  title: string;
  /** India calendar days (YYYY-MM-DD), both included. */
  range: { from: string; to: string };
  cards: ReportCard[];
  chart: ReportChart | null;
  /** Extra tables shown between the chart and the main table. */
  tables?: ReportTable[];
  /** Heading of the main table, when the page has more than one table. */
  tableTitle?: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  /** Present when the rows are paged (orders, search terms). */
  page?: ReportPage;
  /** Short plain-language remarks about how the numbers were worked out. */
  notes: string[];
}
