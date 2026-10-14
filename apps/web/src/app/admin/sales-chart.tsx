'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';

interface Point {
  date: string;
  revenue: number;
  orders: number;
}

/** Dashboard sales-trend chart (revenue bars) with a 7d / 30d toggle. */
export function SalesChart() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Point[]>([]);

  useEffect(() => {
    void adminFetch<Point[]>(`/admin/reports/sales-trend?days=${days}`)
      .then(setData)
      .catch(() => setData([]));
  }, [days]);

  const { max, total, orders } = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.revenue));
    const total = data.reduce((s, d) => s + d.revenue, 0);
    const orders = data.reduce((s, d) => s + d.orders, 0);
    return { max, total, orders };
  }, [data]);

  const W = 720;
  const H = 200;
  const pad = 8;
  const n = data.length || 1;
  const bw = (W - pad * 2) / n;

  return (
    <section className="admin-card">
      <div className="admin-card__head">
        <div>
          <h2>Sales Trend</h2>
          <span className="admin-subtitle" style={{ margin: 0 }}>
            {formatInr(total)} revenue · {orders} orders · last {days} days
          </span>
        </div>
        <div className="chart-toggle">
          <button className={days === 7 ? 'is-on' : ''} onClick={() => setDays(7)}>7D</button>
          <button className={days === 30 ? 'is-on' : ''} onClick={() => setDays(30)}>30D</button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="admin-empty">No sales in this period.</div>
      ) : (
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H + 26}`} role="img" aria-label="Sales trend">
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={pad} x2={W - pad} y1={H - H * g} y2={H - H * g} className="chart-grid" />
          ))}
          {data.map((d, i) => {
            const h = Math.round((d.revenue / max) * (H - 10));
            const x = pad + i * bw;
            const step = Math.ceil(n / 8);
            const showLabel = i % step === 0 || i === n - 1;
            return (
              <g key={d.date}>
                <rect
                  x={x + bw * 0.18}
                  y={H - h}
                  width={bw * 0.64}
                  height={h}
                  rx={3}
                  className="chart-bar"
                >
                  <title>{`${d.date}: ${formatInr(d.revenue)} · ${d.orders} orders`}</title>
                </rect>
                {showLabel && (
                  <text x={x + bw / 2} y={H + 16} textAnchor="middle" className="chart-xlabel">
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}
