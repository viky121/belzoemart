'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';

interface Report {
  totalCustomers: number;
  repeatCustomers: number;
  newCustomers: number;
}
interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'blocked';
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}
interface CustomerList {
  items: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}
interface Address {
  id: string;
  label?: string | null;
  fullName?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}
interface OrderBrief {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
}
interface CustomerDetail extends CustomerRow {
  locale: string;
  addresses: Address[];
  orders: OrderBrief[];
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminCustomersPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [list, setList] = useState<CustomerList | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (q.trim()) params.set('q', q.trim());
    const [r, l] = await Promise.all([
      adminFetch<Report>('/admin/reports/customers').catch(() => null),
      adminFetch<CustomerList>(`/admin/customers?${params.toString()}`).catch(() => null),
    ]);
    setReport(r);
    setList(l);
    setLoading(false);
  }, [q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDetail(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setDetail(await adminFetch<CustomerDetail>(`/admin/customers/${id}`).catch(() => null));
  }

  async function setStatus(c: CustomerRow, status: 'active' | 'blocked') {
    await adminFetch(`/admin/customers/${c.id}/status`, { method: 'PATCH', body: { status } }).catch(() => undefined);
    setMsg(`${c.name} ${status === 'blocked' ? 'blocked' : 'unblocked'}.`);
    void load();
  }

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div data-testid="admin-customers">
      <h1>Customers</h1>
      <p className="admin-subtitle">Your customer base — details, orders and access.</p>
      {msg && <p role="status" className="catalogue-msg" data-testid="customers-msg">{msg}</p>}

      {report && (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="value">{report.totalCustomers}</div><div className="label">Total customers</div></div>
          <div className="kpi-card"><div className="value">{report.repeatCustomers}</div><div className="label">Repeat customers</div></div>
          <div className="kpi-card"><div className="value">{report.newCustomers}</div><div className="label">New (single-order)</div></div>
        </div>
      )}

      <input
        className="pm-search"
        placeholder="Search by name, email or phone…"
        value={q}
        onChange={(e) => {
          setPage(1);
          setQ(e.target.value);
        }}
        data-testid="customers-search"
        style={{ margin: '14px 0' }}
      />

      <section className="admin-card">
        <div className="admin-card__head"><h2>All customers {list ? `(${list.total})` : ''}</h2></div>
        {loading ? (
          <div className="admin-empty">Loading…</div>
        ) : !list || list.items.length === 0 ? (
          <div className="admin-empty">No customers found.</div>
        ) : (
          <table className="admin-table" data-testid="customers-list">
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Orders</th><th>Spent</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {list.items.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td><strong>{c.name}</strong></td>
                    <td>
                      <span className="admin-muted" style={{ fontSize: '0.8rem' }}>
                        {c.email ?? '—'}
                        {c.phone ? <><br />{c.phone}</> : null}
                      </span>
                    </td>
                    <td>{c.orderCount}</td>
                    <td>{formatInr(c.totalSpent)}</td>
                    <td>
                      <span className={`status-badge status-badge--${c.status === 'active' ? 'published' : 'archived'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>{fmtDate(c.createdAt)}</td>
                    <td className="admin-actions">
                      <button onClick={() => toggleDetail(c.id)} data-testid={`customer-view-${c.id}`}>
                        {openId === c.id ? 'Close' : 'View'}
                      </button>
                      {c.status === 'active' ? (
                        <button className="admin-btn--danger" onClick={() => setStatus(c, 'blocked')}>Block</button>
                      ) : (
                        <button onClick={() => setStatus(c, 'active')}>Unblock</button>
                      )}
                    </td>
                  </tr>
                  {openId === c.id && (
                    <tr>
                      <td colSpan={7}>
                        {!detail ? (
                          <p className="admin-muted" style={{ margin: 0 }}>Loading details…</p>
                        ) : (
                          <div className="cust-detail">
                            <div className="cust-detail__col">
                              <h4>Addresses ({detail.addresses.length})</h4>
                              {detail.addresses.length === 0 ? (
                                <p className="admin-muted">No saved addresses.</p>
                              ) : (
                                detail.addresses.map((a) => (
                                  <p key={a.id} className="cust-addr">
                                    <strong>{a.label?.toUpperCase() || 'ADDRESS'}</strong>
                                    {a.fullName ? ` · ${a.fullName}` : ''}
                                    {a.phone ? ` · ${a.phone}` : ''}
                                    <br />
                                    {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} - {a.pincode}
                                  </p>
                                ))
                              )}
                            </div>
                            <div className="cust-detail__col">
                              <h4>Recent orders ({detail.orders.length})</h4>
                              {detail.orders.length === 0 ? (
                                <p className="admin-muted">No orders yet.</p>
                              ) : (
                                <table className="cust-orders">
                                  <tbody>
                                    {detail.orders.map((o) => (
                                      <tr key={o.id}>
                                        <td>#{o.id.slice(0, 8)}</td>
                                        <td><span className={`status-badge status-badge--${o.status}`}>{o.status}</span></td>
                                        <td>{formatInr(o.grandTotal)}</td>
                                        <td className="admin-muted">{fmtDate(o.createdAt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        {list && totalPages > 1 && (
          <div className="admin-pager">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
          </div>
        )}
      </section>
    </div>
  );
}
