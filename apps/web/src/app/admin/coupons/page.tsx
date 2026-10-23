'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';

type Kind = 'flat' | 'percent' | 'free_shipping';

interface Coupon {
  id: string;
  code: string;
  kind: Kind;
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  endsAt: string | null;
  isActive: boolean;
  _count?: { redemptions: number };
}

const rupeesToPaise = (r: string) => Math.round(parseFloat(r || '0') * 100);
const num = (s: string) => (s.trim() === '' ? null : Math.max(0, parseInt(s, 10) || 0));

/** Admin offers & coupons management (FR-10). */
export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState('');
  const [kind, setKind] = useState<Kind>('percent');
  const [value, setValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [perUserLimit, setPerUserLimit] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const load = useCallback(async () => {
    setCoupons(await adminFetch<Coupon[]>('/admin/coupons').catch(() => []));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function describe(c: Coupon): string {
    if (c.kind === 'free_shipping') return 'Free shipping';
    if (c.kind === 'percent') return `${c.value}% off${c.maxDiscount ? ` (max ${formatInr(c.maxDiscount)})` : ''}`;
    return `${formatInr(c.value)} off`;
  }

  async function create() {
    setMsg(null);
    if (!code.trim()) {
      setMsg('Enter a coupon code.');
      return;
    }
    const body = {
      code: code.trim().toUpperCase(),
      kind,
      value: kind === 'percent' ? Math.max(0, parseInt(value || '0', 10)) : kind === 'flat' ? rupeesToPaise(value) : 0,
      minOrder: rupeesToPaise(minOrder),
      maxDiscount: maxDiscount.trim() ? rupeesToPaise(maxDiscount) : null,
      usageLimit: num(usageLimit),
      perUserLimit: num(perUserLimit),
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      isActive: true,
    };
    setBusy(true);
    try {
      await adminFetch('/admin/coupons', { method: 'POST', body });
      setMsg(`Coupon "${body.code}" created.`);
      setCode('');
      setValue('');
      setMinOrder('');
      setMaxDiscount('');
      setUsageLimit('');
      setPerUserLimit('');
      setEndsAt('');
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not create coupon (code may already exist).');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Coupon) {
    await adminFetch(`/admin/coupons/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }).catch(() => undefined);
    void load();
  }

  async function remove(c: Coupon) {
    if (!window.confirm(`Delete coupon "${c.code}"?`)) return;
    await adminFetch(`/admin/coupons/${c.id}`, { method: 'DELETE' }).catch(() => undefined);
    void load();
  }

  return (
    <div data-testid="admin-coupons">
      <h1>Offers &amp; Coupons</h1>
      <p className="admin-subtitle">Create discount codes customers can apply at checkout.</p>
      {msg && <p role="status" data-testid="coupons-msg" className="catalogue-msg">{msg}</p>}

      <div className="admin-form">
        <h2>Create coupon</h2>
        <div className="prod-grid">
          <div>
            <label className="auth-label">Code *</label>
            <input className="auth-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" data-testid="coupon-code" />
          </div>
          <div>
            <label className="auth-label">Type</label>
            <select className="auth-input" value={kind} onChange={(e) => setKind(e.target.value as Kind)} data-testid="coupon-kind">
              <option value="percent">Percent off</option>
              <option value="flat">Flat amount off</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </div>
          {kind !== 'free_shipping' && (
            <div>
              <label className="auth-label">{kind === 'percent' ? 'Discount %' : 'Discount amount (₹)'}</label>
              <input className="auth-input" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} data-testid="coupon-value" />
            </div>
          )}
          <div>
            <label className="auth-label">Min order (₹)</label>
            <input className="auth-input" type="number" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
          </div>
          {kind === 'percent' && (
            <div>
              <label className="auth-label">Max discount cap (₹)</label>
              <input className="auth-input" type="number" min={0} value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} placeholder="optional" />
            </div>
          )}
          <div>
            <label className="auth-label">Total usage limit</label>
            <input className="auth-input" type="number" min={0} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="unlimited" />
          </div>
          <div>
            <label className="auth-label">Per-user limit</label>
            <input className="auth-input" type="number" min={0} value={perUserLimit} onChange={(e) => setPerUserLimit(e.target.value)} placeholder="unlimited" />
          </div>
          <div>
            <label className="auth-label">Expires on</label>
            <input className="auth-input" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <button className="auth-btn" onClick={create} disabled={busy} data-testid="coupon-create" style={{ marginTop: 12 }}>
          {busy ? 'Creating…' : 'Create coupon'}
        </button>
      </div>

      <section className="admin-card">
        <div className="admin-card__head"><h2>Existing coupons</h2></div>
        {coupons.length === 0 ? (
          <div className="admin-empty">No coupons yet.</div>
        ) : (
          <table className="admin-table" data-testid="coupons-list">
            <thead>
              <tr>
                <th>Code</th><th>Offer</th><th>Min order</th><th>Used</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.code}</strong></td>
                  <td>{describe(c)}</td>
                  <td>{c.minOrder > 0 ? formatInr(c.minOrder) : '—'}</td>
                  <td>{c._count?.redemptions ?? 0}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td>
                    <span className={`status-badge status-badge--${c.isActive ? 'published' : 'archived'}`}>
                      {c.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="admin-actions">
                    <button onClick={() => toggle(c)}>{c.isActive ? 'Disable' : 'Enable'}</button>
                    <button className="admin-btn--danger" onClick={() => remove(c)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
