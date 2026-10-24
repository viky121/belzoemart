import {
  presetRange,
  type RangePreset,
  type ReportCell,
  type ReportId,
  type ReportValueKind,
} from '@belzo/shared';

/** The tabs on the Reports page, in order. `gst` is the older GST and stock tab. */
export const REPORT_TABS: { id: ReportId | 'gst'; label: string; superAdminOnly?: boolean }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'orders', label: 'Orders' },
  { id: 'users', label: 'Users' },
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'brands', label: 'Brands' },
  { id: 'best-sellers', label: 'Best sellers' },
  { id: 'payments', label: 'Payments' },
  { id: 'profit-loss', label: 'Profit & loss', superAdminOnly: true },
  { id: 'gst', label: 'GST & stock' },
];

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  'this-month': 'This month',
  'last-month': 'Last month',
};

/** The quick filter these two days stand for, if any. */
export function activePreset(from: string, to: string, now: Date = new Date()): RangePreset | null {
  for (const p of Object.keys(PRESET_LABELS) as RangePreset[]) {
    const r = presetRange(p, now);
    if (r.from === from && r.to === to) return p;
  }
  return null;
}

/** Query string for a report request (empty values are left out). */
export function reportQuery(params: { from: string; to: string; status?: string; page?: number; format?: 'csv' }): string {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  if (params.format) qs.set('format', params.format);
  return qs.toString();
}

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** How a report value is shown in a card or table cell. */
export function formatCell(value: ReportCell | undefined, kind: ReportValueKind): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return kind === 'status' ? value.replace(/_/g, ' ') : value;
  switch (kind) {
    case 'money':
      return rupees(value);
    case 'pct':
      return `${value}%`;
    case 'int':
      return value.toLocaleString('en-IN');
    default:
      return String(value);
  }
}

/** Short form for chart labels (₹1.2k, ₹3.4L). */
export function compactMoney(paise: number): string {
  const r = paise / 100;
  if (r >= 10_000_000) return `₹${(r / 10_000_000).toFixed(1)}Cr`;
  if (r >= 100_000) return `₹${(r / 100_000).toFixed(1)}L`;
  if (r >= 1_000) return `₹${(r / 1_000).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
}

/** Number of pages for a paged report. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}
