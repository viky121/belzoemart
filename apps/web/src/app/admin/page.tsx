'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-api';
import { useAdminData } from './use-admin-page';
import { SalesChart } from './sales-chart';
import { formatInr } from '@/lib/catalogue-api';

interface Dashboard {
  todayRevenue: number;
  todayOrders: number;
  aov: number;
  newCustomers: number;
  pendingOrders: number;
  lowStockCount: number;
}
interface AdminOrder {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
}

const STATUS_CLASS: Record<string, string> = {
  delivered: 'admin-status--ok',
  cancelled: 'admin-status--bad',
  returned: 'admin-status--bad',
  pending: 'admin-status--warn',
  confirmed: 'admin-status--info',
};

/** Flipkart-style admin dashboard: KPIs, alerts, quick actions, recent orders. */
export default function AdminDashboardPage() {
  const { data, loading } = useAdminData<Dashboard>('/admin/dashboard');
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  useEffect(() => {
    void adminFetch<{ items: AdminOrder[] }>('/admin/orders?pageSize=6')
      .then((o) => setOrders((o.items ?? []).slice(0, 6)))
      .catch(() => setOrders([]));
  }, []);

  if (loading) return <p data-testid="admin-dashboard-loading">Loading…</p>;
  if (!data) return null;

  const kpis = [
    { label: "Today's Revenue", value: formatInr(data.todayRevenue), icon: '₹', tone: 'a', testid: 'kpi-revenue' },
    { label: "Today's Orders", value: String(data.todayOrders), icon: '🧾', tone: 'b', testid: 'kpi-orders' },
    { label: 'Average Order Value', value: formatInr(data.aov), icon: '📊', tone: 'c', testid: 'kpi-aov' },
    { label: 'New Customers Today', value: String(data.newCustomers), icon: '👤', tone: 'd', testid: 'kpi-new-customers' },
  ];

  return (
    <div data-testid="admin-dashboard">
      <h1>Dashboard</h1>
      <p className="admin-subtitle">Welcome back — here&apos;s how your store is doing today.</p>

      <div className="dash-kpis">
        {kpis.map((k) => (
          <div className={`dash-kpi dash-kpi--${k.tone}`} key={k.label} data-testid={k.testid}>
            <span className="dash-kpi__icon">{k.icon}</span>
            <div>
              <div className="dash-kpi__value">{k.value}</div>
              <div className="dash-kpi__label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <SalesChart />

      <div className="dash-grid">
        <div className="dash-col">
          {/* Action-needed alerts */}
          <div className="dash-alerts">
            <Link href="/admin/orders" className="dash-alert dash-alert--warn" data-testid="alert-pending">
              <div>
                <span className="dash-alert__value">{data.pendingOrders}</span>
                <span className="dash-alert__label">Pending orders</span>
              </div>
              <span className="dash-alert__cta">Process →</span>
            </Link>
            <Link href="/admin/catalogue" className="dash-alert dash-alert--bad" data-testid="alert-low-stock">
              <div>
                <span className="dash-alert__value">{data.lowStockCount}</span>
                <span className="dash-alert__label">Low-stock variants</span>
              </div>
              <span className="dash-alert__cta">Restock →</span>
            </Link>
          </div>

          {/* Recent orders */}
          <section className="admin-card">
            <div className="admin-card__head">
              <h2>Recent Orders</h2>
              <Link href="/admin/orders" className="dash-link">View all →</Link>
            </div>
            {orders.length === 0 ? (
              <div className="admin-empty">No orders yet.</div>
            ) : (
              <table className="admin-table">
                <thead><tr><th>Order</th><th>Status</th><th>Total</th><th>Placed</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td><strong>#{o.id.slice(0, 8).toUpperCase()}</strong></td>
                      <td><span className={`admin-status ${STATUS_CLASS[o.status] ?? ''}`}>{o.status.replace(/_/g, ' ')}</span></td>
                      <td>{formatInr(o.grandTotal)}</td>
                      <td>{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="dash-col">
          {/* Quick actions */}
          <section className="admin-card">
            <div className="admin-card__head"><h2>Quick Actions</h2></div>
            <div className="dash-actions">
              <Link href="/admin/catalogue" className="dash-action"><span>➕</span> Add Product</Link>
              <Link href="/admin/categories" className="dash-action"><span>🗂️</span> Manage Categories</Link>
              <Link href="/admin/orders" className="dash-action"><span>🚚</span> Fulfil Orders</Link>
              <Link href="/admin/marketing" className="dash-action"><span>📣</span> Banners &amp; CMS</Link>
              <Link href="/admin/reports" className="dash-action"><span>📈</span> View Reports</Link>
              <Link href="/admin/settings" className="dash-action"><span>⚙️</span> Store Settings</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
