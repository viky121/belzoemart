'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatInr } from '@belzo/shared';
import { ApiClientError } from '@/lib/api-client';
import { adminFetch } from '@/lib/admin-api';
import { isUsableImageUrl, placeholderImage } from '@/lib/category-theme';
import { useAdminSession } from '../admin-session';
import {
  STATUS_CLASS, STATUS_TEXT, buildOfferBody, emptyForm, formFromOffer, offerSummary,
  type AdminOffer, type OfferForm, type OfferPack,
} from './offers-ui';

const message = (err: unknown, fallback = 'Something went wrong. Please try again.') =>
  err instanceof ApiClientError ? err.payload.message : fallback;

/** Special-price offers: "shop 2000, get sugar 1 kg at 29". */
export default function AdminOffersPage() {
  const { can } = useAdminSession();
  const canEdit = can('offers.edit');
  const [offers, setOffers] = useState<AdminOffer[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: OfferForm } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOffers(await adminFetch<AdminOffer[]>('/admin/offers'));
      setError(null);
    } catch (err) {
      setError(message(err, 'Could not load offers.'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(o: AdminOffer) {
    try {
      await adminFetch(`/admin/offers/${o.id}`, { method: 'PATCH', body: { isActive: !o.isActive } });
      setNotice(o.isActive ? `"${o.name}" is switched off.` : `"${o.name}" is switched on.`);
      await load();
    } catch (err) {
      setNotice(message(err));
    }
  }
  async function remove(o: AdminOffer) {
    if (!window.confirm(`Delete the offer "${o.name}"? Past orders keep their prices.`)) return;
    try {
      await adminFetch(`/admin/offers/${o.id}`, { method: 'DELETE' });
      setNotice(`"${o.name}" deleted.`);
      await load();
    } catch (err) {
      setNotice(message(err));
    }
  }

  return (
    <div data-testid="admin-offers">
      <div className="acc-head">
        <h1>Offers</h1>
        {canEdit && !editing && (
          <button type="button" className="acc-btn acc-btn--primary" onClick={() => setEditing({ id: null, form: emptyForm() })} data-testid="offer-add">
            Add offer
          </button>
        )}
      </div>
      <p className="acc-hint">
        Special prices that unlock when a customer spends enough. Example: shop ₹2,000 and get Sugar 1 kg at ₹29. The customer can buy only the
        offer units of that pack per order while the offer is on.
      </p>
      {notice && <p role="status" className="acc-msg" data-testid="offers-msg">{notice}</p>}
      {error && <p role="alert" className="acc-error">{error}</p>}

      {editing && (
        <OfferEditor
          id={editing.id}
          initial={editing.form}
          onCancel={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setNotice(`"${name}" saved. Customers see it straight away.`);
            void load();
          }}
        />
      )}

      <div className="admin-card">
        {offers === null ? (
          <p role="status" className="acc-loading">Loading…</p>
        ) : offers.length === 0 ? (
          <p className="acc-loading" data-testid="offers-empty">No offers yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Offer</th>
                <th>Status</th>
                <th>Sold</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} data-testid={`offer-row-${o.id}`}>
                  <td>
                    <strong>{o.name}</strong>
                    <small className="acc-sub">{offerSummary(o)}</small>
                    <small className="acc-sub">
                      Normal price {formatInr(o.variant.sellingPrice)} · Stock {o.variant.available}
                      {o.endsAt ? ` · Ends ${new Date(o.endsAt).toLocaleString('en-IN')}` : ''}
                      {o.startsAt && o.status === 'scheduled' ? ` · Starts ${new Date(o.startsAt).toLocaleString('en-IN')}` : ''}
                    </small>
                    {o.belowCost && <em className="acc-badge acc-badge--warn" data-testid={`offer-below-cost-${o.id}`}>Below cost price</em>}
                  </td>
                  <td>
                    <span className={`admin-status ${STATUS_CLASS[o.status]}`}>{STATUS_TEXT[o.status]}</span>
                  </td>
                  <td>{o.soldUnits}</td>
                  <td className="acc-actions">
                    {canEdit && (
                      <>
                        <button type="button" className="acc-link" onClick={() => setEditing({ id: o.id, form: formFromOffer(o) })} data-testid={`offer-edit-${o.id}`}>
                          Edit
                        </button>
                        <button type="button" className="acc-link" onClick={() => void toggle(o)} data-testid={`offer-toggle-${o.id}`}>
                          {o.isActive ? 'Switch off' : 'Switch on'}
                        </button>
                        <button type="button" className="acc-link acc-link--danger" onClick={() => void remove(o)} data-testid={`offer-delete-${o.id}`}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OfferEditor({
  id,
  initial,
  onSaved,
  onCancel,
}: {
  id: string | null;
  initial: OfferForm;
  onSaved: (name: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<OfferForm>(initial);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<OfferPack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof OfferForm>(key: K, value: OfferForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void adminFetch<OfferPack[]>(`/admin/offers/packs?search=${encodeURIComponent(term)}`)
        .then((rows) => alive && setResults(rows))
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const built = buildOfferBody(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (id) await adminFetch(`/admin/offers/${id}`, { method: 'PATCH', body: built.body });
      else await adminFetch('/admin/offers', { method: 'POST', body: built.body });
      onSaved(built.body.name);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const pack = form.pack;
  return (
    <form className="admin-card acc-editor" onSubmit={save} data-testid="offer-editor">
      <h2>{id ? 'Edit offer' : 'New offer'}</h2>
      <div className="acc-fields">
        <label>
          Offer name (only you see this)
          <input className="auth-input" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="Sugar at 29 above 2000" data-testid="offer-name" />
        </label>
        <label>
          Customer must spend (₹)
          <input className="auth-input" inputMode="decimal" value={form.spendRupees} onChange={(e) => set('spendRupees', e.target.value)} placeholder="2000" data-testid="offer-spend" />
          <small>On the other items in the cart, before any coupon.</small>
        </label>
        <label>
          Special price (₹)
          <input className="auth-input" inputMode="decimal" value={form.specialRupees} onChange={(e) => set('specialRupees', e.target.value)} placeholder="29" data-testid="offer-price" />
          <small>Final price with GST included.</small>
        </label>
        <label>
          Units per order
          <input className="auth-input" inputMode="numeric" value={form.units} onChange={(e) => set('units', e.target.value)} data-testid="offer-units" />
          <small>While the offer is on, the pack cannot be bought in a bigger quantity.</small>
        </label>
        <label>
          Starts (optional)
          <input className="auth-input" type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} data-testid="offer-starts" />
        </label>
        <label>
          Ends (optional)
          <input className="auth-input" type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} data-testid="offer-ends" />
        </label>
      </div>

      <h3>Product pack that gets the special price</h3>
      {pack ? (
        <div className="offerpick offerpick--chosen" data-testid="offer-pack">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={isUsableImageUrl(pack.imageUrl) ? pack.imageUrl! : placeholderImage(pack.title, pack.variantId)} alt="" />
          <span>
            <strong>{pack.title}</strong> {pack.unit}
            <small className="acc-sub">Normal price {formatInr(pack.sellingPrice)} · Stock {pack.available}</small>
          </span>
          <button type="button" className="acc-link" onClick={() => set('pack', null)} data-testid="offer-pack-change">Change</button>
        </div>
      ) : (
        <>
          <input className="auth-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a product or SKU (type 2 letters)" data-testid="offer-pack-search" />
          <ul className="offerpick__list" data-testid="offer-pack-results">
            {results.map((r) => (
              <li key={r.variantId}>
                <button type="button" className="offerpick" onClick={() => { set('pack', r); setSearch(''); setResults([]); }} data-testid={`offer-pack-${r.variantId}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={isUsableImageUrl(r.imageUrl) ? r.imageUrl! : placeholderImage(r.title, r.variantId)} alt="" />
                  <span>
                    <strong>{r.title}</strong> {r.unit}
                    <small className="acc-sub">{formatInr(r.sellingPrice)} · Stock {r.available}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <label className="acc-check">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} data-testid="offer-active" />
        Switched on
      </label>
      {error && <p role="alert" className="acc-error" data-testid="offer-error">{error}</p>}
      <div className="acc-footer">
        <button type="button" className="acc-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="acc-btn acc-btn--primary" disabled={busy} data-testid="offer-save">
          {busy ? 'Saving…' : 'Save offer'}
        </button>
      </div>
    </form>
  );
}
