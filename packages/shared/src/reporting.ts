/**
 * Reporting helpers shared by API (CSV export) and any client-side use.
 */

/**
 * Serialize rows to CSV (BR-6). Fields containing a comma, quote, or newline
 * are wrapped in double quotes with embedded quotes doubled (RFC 4180). Every
 * row is emitted with the same column order derived from `columns`, so the
 * column count is stable regardless of field content.
 */
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown): string => {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map(escape).join(',');
  const body = rows.map((row) => columns.map((c) => escape(row[c])).join(',')).join('\n');
  return body ? `${header}\n${body}` : header;
}

/** Average order value = revenue / orders (0 when no orders). Integer paise. */
export function averageOrderValue(revenue: number, orders: number): number {
  if (orders <= 0) return 0;
  return Math.round(revenue / orders);
}
