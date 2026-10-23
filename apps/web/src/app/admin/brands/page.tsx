'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, adminUpload } from '@/lib/admin-api';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  _count?: { products: number };
}

/** Admin brand manager — powers the storefront "Top Brands" row. */
export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [editUploading, setEditUploading] = useState(false);

  const load = useCallback(async () => {
    setBrands(await adminFetch<Brand[]>('/admin/brands').catch(() => []));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function uploadLogo(file: File, forEdit: boolean) {
    const setU = forEdit ? setEditUploading : setUploading;
    setU(true);
    try {
      const { url } = await adminUpload(file, 'brands');
      if (forEdit) setEditLogo(url);
      else setLogoUrl(url);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Logo upload failed.');
    } finally {
      setU(false);
    }
  }

  async function create() {
    if (!name.trim()) {
      setMsg('Enter a brand name.');
      return;
    }
    setBusy(true);
    try {
      await adminFetch('/admin/brands', { method: 'POST', body: { name: name.trim(), logoUrl: logoUrl || undefined } });
      setMsg(`Brand "${name.trim()}" added.`);
      setName('');
      setLogoUrl('');
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add brand.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(b: Brand) {
    setEditId(b.id);
    setEditName(b.name);
    setEditLogo(b.logoUrl ?? '');
    setMsg(null);
  }

  async function saveEdit() {
    if (!editId || !editName.trim()) return;
    setBusy(true);
    try {
      await adminFetch('/admin/brands', {
        method: 'POST',
        body: { id: editId, name: editName.trim(), logoUrl: editLogo || undefined },
      });
      setEditId(null);
      setMsg('Brand updated.');
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update brand.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Brand) {
    if (!window.confirm(`Delete brand "${b.name}"? Products keep working but lose this brand.`)) return;
    await adminFetch(`/admin/brands/${b.id}`, { method: 'DELETE' }).catch(() => undefined);
    setMsg(`Deleted "${b.name}".`);
    if (editId === b.id) setEditId(null);
    void load();
  }

  return (
    <div data-testid="admin-brands">
      <h1>Brands</h1>
      <p className="admin-subtitle">Manage the brands shown in the storefront “Top Brands” row.</p>
      {msg && <p role="status" data-testid="brands-msg" className="catalogue-msg">{msg}</p>}

      <div className="admin-form">
        <h2>Add brand</h2>
        <div className="prod-grid">
          <div>
            <label className="auth-label">Brand name *</label>
            <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tata" data-testid="brand-name" />
          </div>
          <div>
            <label className="auth-label">Logo (optional)</label>
            <input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0], false)} />
            {uploading && <span className="prod-form__hint"> Uploading…</span>}
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" style={{ height: 36, marginTop: 6, borderRadius: 6, display: 'block' }} />
            )}
          </div>
        </div>
        <button className="auth-btn" onClick={create} disabled={busy} data-testid="brand-create" style={{ marginTop: 12 }}>
          {busy ? 'Saving…' : 'Add Brand'}
        </button>
      </div>

      <section className="admin-card">
        <div className="admin-card__head"><h2>All brands ({brands.length})</h2></div>
        {brands.length === 0 ? (
          <div className="admin-empty">No brands yet.</div>
        ) : (
          <table className="admin-table" data-testid="brands-list">
            <thead>
              <tr><th>Logo</th><th>Name</th><th>Products</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {brands.map((b) =>
                editId === b.id ? (
                  <tr key={b.id}>
                    <td>
                      <input type="file" accept="image/*" disabled={editUploading} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0], true)} />
                      {editLogo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={editLogo} alt="" style={{ height: 30, marginTop: 4, borderRadius: 4, display: 'block' }} />
                      )}
                    </td>
                    <td><input className="auth-input" value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="brand-edit-name" /></td>
                    <td>{b._count?.products ?? 0}</td>
                    <td className="admin-actions">
                      <button onClick={saveEdit} disabled={busy} data-testid="brand-edit-save">Save</button>
                      <button onClick={() => setEditId(null)}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id}>
                    <td>
                      {b.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logoUrl} alt={b.name} style={{ height: 30, maxWidth: 90, objectFit: 'contain' }} />
                      ) : (
                        <span className="admin-muted">—</span>
                      )}
                    </td>
                    <td><strong>{b.name}</strong></td>
                    <td>{b._count?.products ?? 0}</td>
                    <td className="admin-actions">
                      <button onClick={() => startEdit(b)} data-testid={`brand-edit-${b.slug}`}>Edit</button>
                      <button className="admin-btn--danger" onClick={() => remove(b)} data-testid={`brand-delete-${b.slug}`}>Delete</button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
