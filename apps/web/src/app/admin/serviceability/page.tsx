'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';

/** Admin: manage the list of serviceable delivery PIN codes. */
export default function AdminServiceabilityPage() {
  const [pincodes, setPincodes] = useState<string[]>([]);
  const [entry, setEntry] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function load() {
    setLoading(true);
    const res = await adminFetch<{ pincodes: string[] }>('/admin/serviceability').catch(() => ({
      pincodes: [],
    }));
    setPincodes(res.pincodes ?? []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  function addPin() {
    setErr(null);
    setMsg(null);
    const pin = entry.trim();
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setErr('Enter a valid 6-digit PIN code.');
      return;
    }
    if (pincodes.includes(pin)) {
      setErr(`PIN ${pin} is already in the list.`);
      return;
    }
    setPincodes((cur) => [...cur, pin]);
    setEntry('');
    setDirty(true);
  }

  function removePin(pin: string) {
    setPincodes((cur) => cur.filter((p) => p !== pin));
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await adminFetch('/admin/serviceability', { method: 'PUT', body: { pincodes } });
      setMsg(`Saved. ${pincodes.length} serviceable PIN code${pincodes.length === 1 ? '' : 's'}.`);
      setDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="admin-serviceability">
      <h1>Delivery Serviceability</h1>
      <p className="admin-subtitle">
        Only orders delivering to the PIN codes below are allowed. Customers with any other PIN
        cannot place an order. Leave the list empty to deliver everywhere.
      </p>

      {msg && (
        <p role="status" className="admin-success" data-testid="svc-msg">
          {msg}
        </p>
      )}
      {err && (
        <p role="alert" className="auth-error" data-testid="svc-err">
          {err}
        </p>
      )}

      <section className="admin-card" style={{ maxWidth: 640 }}>
        <div className="svc-add">
          <input
            className="auth-input"
            value={entry}
            inputMode="numeric"
            maxLength={6}
            placeholder="e.g. 472001"
            onChange={(e) => setEntry(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPin();
            }}
            data-testid="svc-input"
          />
          <button type="button" onClick={addPin} data-testid="svc-add">
            + Add PIN
          </button>
        </div>

        {loading ? (
          <p className="admin-muted">Loading…</p>
        ) : pincodes.length === 0 ? (
          <p className="admin-muted" data-testid="svc-empty">
            No PIN codes set — delivery is currently open to all of India.
          </p>
        ) : (
          <div className="svc-chips" data-testid="svc-chips">
            {pincodes.map((p) => (
              <span className="svc-chip" key={p}>
                {p}
                <button
                  type="button"
                  aria-label={`Remove ${p}`}
                  onClick={() => removePin(p)}
                  data-testid={`svc-remove-${p}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="svc-actions">
          <button
            className="wiz__next"
            onClick={save}
            disabled={saving || !dirty}
            data-testid="svc-save"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {dirty && <span className="admin-muted">You have unsaved changes.</span>}
        </div>
      </section>
    </div>
  );
}
