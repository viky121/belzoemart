'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  addressBody, addressLine, addressToForm, emptyAddressForm, validateAddressForm,
  type AddressForm, type SavedAddress,
} from '@/lib/address-form';

/**
 * Saved delivery addresses on My Account: see them all, add, change, delete and choose the default.
 * Changes are saved on the server straight away and the list is read again, so what is shown is what is saved.
 */
export function AddressManager() {
  const { authFetch, customer } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  // null = list only, 'new' = adding, otherwise the address being changed
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAddresses(await authFetch<SavedAddress[]>('/me/addresses'));
    } catch {
      setAddresses((cur) => cur ?? []);
      setNotice('Could not load your addresses. Please try again.');
    }
  }, [authFetch]);
  useEffect(() => {
    void load();
  }, [load]);

  const prefill = {
    fullName: customer?.name && customer.name.trim() !== 'Belzo Customer' ? customer.name.trim() : '',
    phone: (customer?.phone ?? '').replace(/\D/g, '').slice(-10),
  };

  async function makeDefault(a: SavedAddress) {
    try {
      await authFetch(`/me/addresses/${a.id}?default=true`, { method: 'PUT', body: addressBody(addressToForm(a)) });
      setNotice('Default address changed.');
      await load();
    } catch {
      setNotice('Could not change the default address.');
    }
  }
  async function remove(a: SavedAddress) {
    if (!window.confirm('Delete this address?')) return;
    try {
      await authFetch(`/me/addresses/${a.id}`, { method: 'DELETE' });
      setNotice('Address deleted.');
      await load();
    } catch {
      setNotice('Could not delete the address.');
    }
  }

  return (
    <div className="acct-card" id="addresses" data-testid="account-addresses">
      <div className="acct-card__head">
        <h2>📍 Delivery Addresses</h2>
        {!editing && (
          <button type="button" className="acct-edit" onClick={() => setEditing('new')} data-testid="address-add">
            + Add new
          </button>
        )}
      </div>
      {notice && <p role="status" className="acct-addr" data-testid="address-notice">{notice}</p>}
      {editing ? (
        <AddressFormView
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? emptyAddressForm(prefill) : addressToForm(editing)}
          addressId={editing === 'new' ? null : editing.id}
          isDefault={editing === 'new' ? false : editing.isDefault}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice('Address saved.');
            await load();
          }}
        />
      ) : addresses === null ? (
        <p className="acct-addr">Loading…</p>
      ) : addresses.length === 0 ? (
        <p className="acct-addr">No saved addresses yet.</p>
      ) : (
        <ul className="addrlist" data-testid="address-list">
          {addresses.map((a) => (
            <li key={a.id} className="addrlist__item" data-testid={`address-${a.id}`}>
              <div className="addrlist__body">
                <strong>
                  {a.fullName || 'Address'} <span className="addrlist__tag">{a.label}</span>
                  {a.isDefault && <span className="addrlist__tag addrlist__tag--default">Default</span>}
                </strong>
                <span>{addressLine(a)}</span>
                {a.phone && <span>📞 {a.phone}</span>}
              </div>
              <div className="addrlist__actions">
                <button type="button" className="acct-edit" onClick={() => setEditing(a)} data-testid={`address-edit-${a.id}`}>Edit</button>
                {!a.isDefault && (
                  <button type="button" className="acct-edit" onClick={() => void makeDefault(a)} data-testid={`address-default-${a.id}`}>Make default</button>
                )}
                <button type="button" className="acct-edit addrlist__danger" onClick={() => void remove(a)} data-testid={`address-delete-${a.id}`}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AddressFormView({
  initial,
  addressId,
  isDefault,
  onSaved,
  onCancel,
}: {
  initial: AddressForm;
  addressId: string | null;
  isDefault: boolean;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { authFetch } = useAuth();
  const [form, setForm] = useState<AddressForm>(initial);
  const [makeDefault, setMakeDefault] = useState(isDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof AddressForm>(key: K, value: AddressForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onPincode(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    set('pincode', digits);
    if (/^[1-9]\d{5}$/.test(digits)) {
      try {
        const r = await authFetch<{ city: string | null; state: string | null }>(`/me/addresses/resolve-pincode?pincode=${digits}`);
        setForm((f) => ({ ...f, city: f.city || r.city || '', state: f.state || r.state || '' }));
      } catch {
        /* the customer can type city and state */
      }
    }
  }

  async function save() {
    const problem = validateAddressForm(form);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const query = makeDefault ? '?default=true' : '';
      if (addressId) await authFetch(`/me/addresses/${addressId}${query}`, { method: 'PUT', body: addressBody(form) });
      else await authFetch(`/me/addresses${query}`, { method: 'POST', body: addressBody(form) });
      await onSaved();
    } catch {
      setError('Could not save the address. Check the details and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="addr-form" data-testid="address-form">
      {error && <p className="auth-error" role="alert" data-testid="address-error">{error}</p>}
      <div className="addr-grid">
        <div>
          <label className="auth-label" htmlFor="af-label">Address type</label>
          <select id="af-label" className="auth-input" value={form.label} onChange={(e) => set('label', e.target.value as AddressForm['label'])}>
            <option value="home">Home</option>
            <option value="work">Work</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="auth-label" htmlFor="af-name">Full name</label>
          <input id="af-name" className="auth-input" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} data-testid="af-name" />
        </div>
        <div>
          <label className="auth-label" htmlFor="af-phone">Mobile number</label>
          <input id="af-phone" className="auth-input" inputMode="numeric" value={form.phone} onChange={(e) => set('phone', e.target.value)} data-testid="af-phone" />
        </div>
        <div>
          <label className="auth-label" htmlFor="af-pin">PIN code</label>
          <input id="af-pin" className="auth-input" inputMode="numeric" value={form.pincode} onChange={(e) => void onPincode(e.target.value)} data-testid="af-pin" />
        </div>
        <div className="addr-grid__full">
          <label className="auth-label" htmlFor="af-line1">Address (house no, street, area)</label>
          <input id="af-line1" className="auth-input" value={form.line1} onChange={(e) => set('line1', e.target.value)} data-testid="af-line1" />
        </div>
        <div className="addr-grid__full">
          <label className="auth-label" htmlFor="af-line2">Landmark / locality (optional)</label>
          <input id="af-line2" className="auth-input" value={form.line2} onChange={(e) => set('line2', e.target.value)} data-testid="af-line2" />
        </div>
        <div>
          <label className="auth-label" htmlFor="af-city">City</label>
          <input id="af-city" className="auth-input" value={form.city} onChange={(e) => set('city', e.target.value)} data-testid="af-city" />
        </div>
        <div>
          <label className="auth-label" htmlFor="af-state">State</label>
          <input id="af-state" className="auth-input" value={form.state} onChange={(e) => set('state', e.target.value)} data-testid="af-state" />
        </div>
      </div>
      <label className="addrlist__check">
        <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} data-testid="af-default" />
        Make this my default address
      </label>
      <div className="addr-form__actions">
        <button type="button" className="auth-btn" onClick={() => void save()} disabled={busy} data-testid="af-save">
          {busy ? 'Saving…' : 'Save address'}
        </button>
        <button type="button" className="co-link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
