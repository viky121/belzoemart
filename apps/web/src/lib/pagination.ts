/**
 * The page numbers a pager shows: always the first and the last page, the current page with its neighbours, and a
 * 'gap' (shown as "…") wherever pages are left out. A gap that would hide just one page shows that page instead.
 * Example (page 6 of 20): 1 … 5 6 7 … 20.
 */
export function pageWindow(page: number, pages: number, around = 1): (number | 'gap')[] {
  if (!Number.isFinite(pages) || pages < 1) return [];
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const keep = new Set<number>([1, pages]);
  for (let p = current - around; p <= current + around; p++) {
    if (p >= 1 && p <= pages) keep.add(p);
  }
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev === 2) out.push(prev + 1);
    else if (p - prev > 2) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}

/** "1–25 of 1,346" for the page being shown (empty list: "0 of 0"). */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0) return '0 of 0';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return `${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}`;
}
