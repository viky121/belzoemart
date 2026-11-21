'use client';

import { pageWindow, rangeLabel } from '@/lib/pagination';

export const PAGE_SIZES = [25, 50, 100] as const;

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** A page is being fetched: the buttons stay, but do nothing until it arrives. */
  busy?: boolean;
}

/** Admin list pager: "1–25 of 1,346", first / previous / page numbers / next / last, and a rows-per-page choice. */
export function Pager({ page, pageSize, total, onPage, onPageSize, busy = false }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const go = (p: number) => {
    if (!busy && p >= 1 && p <= pages && p !== page) onPage(p);
  };
  return (
    <nav className="pm-pager" aria-label="Pagination" data-testid="pm-pager">
      <span className="pm-pager__range" data-testid="pm-pager-range">
        Showing {rangeLabel(page, pageSize, total)}
      </span>
      <div className="pm-pager__pages">
        <button type="button" className="pm-pager__btn" disabled={busy || page <= 1} onClick={() => go(page - 1)} data-testid="pm-prev">
          ‹ Prev
        </button>
        {pageWindow(page, pages).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="pm-pager__gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`pm-pager__btn pm-pager__num${p === page ? ' is-on' : ''}`}
              aria-current={p === page ? 'page' : undefined}
              disabled={busy && p !== page}
              onClick={() => go(p)}
              data-testid={`pm-page-${p}`}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" className="pm-pager__btn" disabled={busy || page >= pages} onClick={() => go(page + 1)} data-testid="pm-next">
          Next ›
        </button>
      </div>
      <label className="pm-pager__size">
        Rows per page
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} disabled={busy} data-testid="pm-page-size">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
