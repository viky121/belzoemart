'use client';

import { useMemo, useState } from 'react';
import { isValidDateKey, istDay, presetRange, type RangePreset } from '@belzo/shared';
import { GstStockTab } from './gst-stock-tab';
import { PRESET_LABELS, REPORT_TABS, activePreset } from './report-format';
import { ReportView } from './report-view';

/**
 * Admin reports (Admin 11): sales, orders, users, products, categories, brands, best sellers, payments,
 * profit and loss, and the GST and stock downloads. One date filter applies to every tab; every report
 * can be downloaded as CSV.
 */
export default function AdminReportsPage() {
  const today = useMemo(() => istDay(new Date()), []);
  const [tab, setTab] = useState<string>('sales');
  const [range, setRange] = useState(() => presetRange('30d'));

  const preset = activePreset(range.from, range.to);

  function setDay(key: 'from' | 'to', value: string) {
    if (!isValidDateKey(value)) return;
    const next = { ...range, [key]: value };
    // Keep the two days in order whichever one was changed.
    if (next.from > next.to) {
      if (key === 'from') next.to = next.from;
      else next.from = next.to;
    }
    setRange(next);
  }

  return (
    <div data-testid="admin-reports">
      <h1>Reports</h1>
      <p className="admin-subtitle">Sales, orders, customers, products and profit. Pick the days once; every report follows them.</p>

      <section className="admin-card rep-filter">
        <div className="rep-presets" role="group" aria-label="Quick date filter">
          {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`rep-chip${preset === p ? ' is-on' : ''}`}
              aria-pressed={preset === p}
              onClick={() => setRange(presetRange(p))}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="rep-custom">
          <label>
            <span>From</span>
            <input type="date" className="auth-input" value={range.from} max={today} onChange={(e) => setDay('from', e.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" className="auth-input" value={range.to} max={today} onChange={(e) => setDay('to', e.target.value)} />
          </label>
        </div>
      </section>

      <div className="rep-tabs" role="tablist" aria-label="Reports">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`rep-tab${tab === t.id ? ' is-on' : ''}`}
            onClick={() => setTab(t.id)}
            data-testid={`report-tab-${t.id}`}
          >
            {t.label}
            {t.superAdminOnly && <span className="rep-tab__lock" title="Super Admin only"> 🔒</span>}
          </button>
        ))}
      </div>

      {tab === 'gst' ? <GstStockTab from={range.from} to={range.to} /> : <ReportView key={tab} id={tab} from={range.from} to={range.to} />}
    </div>
  );
}
