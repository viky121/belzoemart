'use client';

import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUSES, type ReportChart, type ReportResponse } from '@belzo/shared';
import { ApiClientError } from '@/lib/api-client';
import { adminDownload, adminFetch } from '@/lib/admin-api';
import { compactMoney, formatCell, pageCount, reportQuery } from './report-format';

const ALIGN_RIGHT = new Set(['money', 'int', 'pct']);

/** Bars for a chart. Day charts are vertical columns; charts with long names (products) are a ranked list. */
function Chart({ chart }: { chart: ReportChart }) {
  const max = Math.max(1, ...chart.points.map((p) => p.value));
  const show = (v: number) => (chart.kind === 'money' ? compactMoney(v) : v.toLocaleString('en-IN'));
  const byDay = chart.points.every((p) => p.label.length <= 5);

  if (!byDay) {
    return (
      <div className="rep-bars" role="img" aria-label={chart.title}>
        {chart.points.map((p) => (
          <div className="rep-bars__row" key={p.label}>
            <span className="rep-bars__label" title={p.label}>
              {p.label}
            </span>
            <span className="rep-bars__track">
              <span className="rep-bars__fill" style={{ width: `${Math.max(2, (p.value / max) * 100)}%` }} />
            </span>
            <span className="rep-bars__value">{show(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }

  const W = 720;
  const H = 180;
  const n = chart.points.length || 1;
  const bw = W / n;
  const every = Math.ceil(n / 12);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={chart.title}>
      {[0.5, 1].map((g) => (
        <line key={g} x1={0} x2={W} y1={H - (H - 12) * g} y2={H - (H - 12) * g} className="chart-grid" />
      ))}
      {chart.points.map((p, i) => {
        const h = Math.round((p.value / max) * (H - 12));
        return (
          <g key={p.label + i}>
            <title>{`${p.label}: ${show(p.value)}${p.extra !== undefined ? ` (${p.extra})` : ''}`}</title>
            <rect x={i * bw + bw * 0.15} y={H - h} width={bw * 0.7} height={Math.max(h, p.value > 0 ? 1 : 0)} rx={2} className="chart-bar" />
            {i % every === 0 && (
              <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" className="chart-xlabel">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** One report: summary cards, a chart, the table, paging (orders) and a CSV download. */
export function ReportView({ id, from, to }: { id: string; from: string; to: string }) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  // A new report or period starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [id, from, to, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminFetch<ReportResponse>(`/admin/report/${id}?${reportQuery({ from, to, status, page })}`);
      setData(r);
    } catch (e) {
      setData(null);
      const forbidden = e instanceof ApiClientError && e.payload.statusCode === 403;
      setError(
        forbidden
          ? 'Only the Super Admin can open this report.'
          : e instanceof Error && e.message
            ? e.message
            : 'Could not load the report.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, from, to, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download() {
    setCsvBusy(true);
    setCsvError(null);
    try {
      await adminDownload(`/admin/report/${id}?${reportQuery({ from, to, status, format: 'csv' })}`, `${id}_${from}_${to}.csv`);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'Could not download the file.');
    } finally {
      setCsvBusy(false);
    }
  }

  if (error) {
    return (
      <div className="admin-empty" role="alert" data-testid="report-error">
        {error}
      </div>
    );
  }
  if (!data) return <div className="admin-empty">Loading report…</div>;

  const pages = data.page ? pageCount(data.page.total, data.page.pageSize) : 1;

  return (
    <div className={loading ? 'rep-body rep-body--busy' : 'rep-body'} data-testid={`report-${id}`}>
      <div className="rep-head">
        <div>
          <h2>{data.title}</h2>
          <span className="admin-subtitle" style={{ margin: 0 }}>
            {data.range.from === data.range.to ? data.range.from : `${data.range.from} to ${data.range.to}`}
          </span>
        </div>
        <div className="rep-head__actions">
          {id === 'orders' && (
            <select className="auth-input rep-status" aria-label="Order status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="rep-btn" onClick={() => void download()} disabled={csvBusy} data-testid="report-csv">
            {csvBusy ? 'Preparing…' : '⬇ Download CSV'}
          </button>
        </div>
      </div>
      {csvError && (
        <p className="prod-form__msg prod-form__msg--err" role="alert">
          {csvError}
        </p>
      )}

      <div className="rep-cards">
        {data.cards.map((c) => (
          <div className={`rep-card${c.tone ? ` rep-card--${c.tone}` : ''}`} key={c.label}>
            <span className="rep-card__label">{c.label}</span>
            <strong className="rep-card__value">{formatCell(c.value, c.kind)}</strong>
            {c.hint && <span className="rep-card__hint">{c.hint}</span>}
          </div>
        ))}
      </div>

      {data.chart && data.chart.points.length > 0 && (
        <section className="admin-card rep-chart">
          <h3>{data.chart.title}</h3>
          <Chart chart={data.chart} />
        </section>
      )}

      <section className="admin-card">
        {data.rows.length === 0 ? (
          <div className="admin-empty">No data for this period.</div>
        ) : (
          <div className="rep-table-wrap">
            <table className="admin-table" data-testid="report-table">
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c.key} className={ALIGN_RIGHT.has(c.kind) ? 'rep-num' : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {data.columns.map((c) => (
                      <td key={c.key} className={ALIGN_RIGHT.has(c.kind) ? 'rep-num' : undefined}>
                        {c.kind === 'status' && typeof row[c.key] === 'string' && row[c.key] !== '' ? (
                          <span className="admin-status">{formatCell(row[c.key], 'status')}</span>
                        ) : (
                          formatCell(row[c.key], c.kind)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.page && pages > 1 && (
          <div className="rep-pager">
            <button type="button" className="rep-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              ← Previous
            </button>
            <span>
              Page {data.page.page} of {pages} ({data.page.total} orders)
            </span>
            <button type="button" className="rep-btn" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </section>

      {data.notes.length > 0 && (
        <ul className="rep-notes">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
