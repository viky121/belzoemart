'use client';

import { useEffect, useState } from 'react';
import { adminFetch, adminUpload } from '@/lib/admin-api';

interface Banner {
  id: string;
  placement: string;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  displayOrder: number;
}

/** Admin marketing: banners + CMS pages (FR-10.3, FR-10.7). */
export default function AdminMarketingPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [order, setOrder] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [pageBody, setPageBody] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const { url } = await adminUpload(file, 'banners');
      setImageUrl(url);
      setMsg('Image uploaded.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function load() {
    setBanners(await adminFetch<Banner[]>('/banners?placement=home_hero').catch(() => []));
  }
  useEffect(() => {
    void load();
  }, []);

  function resetBannerForm() {
    setEditingId(null);
    setTitle('');
    setImageUrl('');
    setLinkUrl('');
    setOrder('');
  }

  function editBanner(b: Banner) {
    setEditingId(b.id);
    setTitle(b.title ?? '');
    setImageUrl(b.imageUrl);
    setLinkUrl(b.linkUrl ?? '');
    setOrder(String(b.displayOrder));
    setMsg(null);
  }

  async function addBanner() {
    if (!imageUrl) {
      setMsg('Upload a banner image first.');
      return;
    }
    await adminFetch('/admin/banners', {
      method: 'POST',
      body: {
        ...(editingId ? { id: editingId } : {}),
        placement: 'home_hero',
        imageUrl,
        title: title || undefined,
        linkUrl: linkUrl || undefined,
        displayOrder: order.trim() ? Math.max(0, parseInt(order, 10) || 0) : banners.length,
      },
    });
    setMsg(editingId ? 'Banner updated.' : 'Banner saved.');
    resetBannerForm();
    void load();
  }

  async function deleteBanner(id: string) {
    if (!window.confirm('Delete this banner?')) return;
    await adminFetch(`/admin/banners/${id}`, { method: 'DELETE' }).catch(() => undefined);
    setMsg('Banner deleted.');
    if (editingId === id) resetBannerForm();
    void load();
  }

  async function savePage() {
    if (!pageTitle || !pageBody) return;
    await adminFetch('/admin/cms/pages', { method: 'POST', body: { title: pageTitle, body: pageBody } });
    setMsg(`CMS page "${pageTitle}" saved.`);
    setPageTitle('');
    setPageBody('');
  }

  return (
    <div data-testid="admin-marketing">
      <h1>Marketing</h1>
      <p className="admin-subtitle">Manage home-page hero banners and CMS content pages.</p>
      {msg && <p role="status" data-testid="marketing-msg">{msg}</p>}

      <div className="admin-form">
        <h2>{editingId ? 'Edit hero banner' : 'Home hero banner'}</h2>
        <p className="slab-editor__hint" style={{ marginTop: 0 }}>
          Add 5 or more banners — the storefront hero rotates through them automatically. Order controls the sequence.
        </p>
        <label>Title (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="banner-title" />
        <label>Link URL (where the banner points, e.g. /category/grocery)</label>
        <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} data-testid="banner-link" placeholder="/search?sort=discount" />
        <label>Display order</label>
        <input type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} data-testid="banner-order" placeholder={String(banners.length)} />
        <label>Upload image</label>
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} data-testid="banner-file" />
        {uploading && <p className="slab-editor__hint">Uploading…</p>}
        <label>Image URL (auto-filled after upload, or paste one)</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} data-testid="banner-image" placeholder="https://…" />
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Banner preview" style={{ maxWidth: 420, marginTop: 8, borderRadius: 6, display: 'block' }} />
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: '0.5rem' }}>
          <button className="btn" onClick={addBanner} data-testid="banner-save">
            {editingId ? 'Update banner' : 'Save banner'}
          </button>
          {editingId && (
            <button className="admin-inline-btn" onClick={resetBannerForm} data-testid="banner-cancel">
              Cancel edit
            </button>
          )}
        </div>
      </div>

      <section className="admin-card">
        <div className="admin-card__head"><h2>Hero banners ({banners.length})</h2></div>
        {banners.length === 0 ? (
          <div className="admin-empty">No banners yet. Add at least 5 for a full slider.</div>
        ) : (
          <table className="admin-table" data-testid="banner-list">
            <thead><tr><th>Order</th><th>Preview</th><th>Title</th><th>Link</th><th>Actions</th></tr></thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id}>
                  <td>{b.displayOrder}</td>
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.imageUrl} alt="" style={{ width: 140, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                  </td>
                  <td>{b.title ?? '—'}</td>
                  <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{b.linkUrl ?? '—'}</td>
                  <td className="admin-actions">
                    <button onClick={() => editBanner(b)} data-testid={`banner-edit-${b.id}`}>Edit</button>
                    <button className="admin-btn--danger" onClick={() => deleteBanner(b.id)} data-testid={`banner-delete-${b.id}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="admin-form">
        <h2>CMS page</h2>
        <label>Title</label>
        <input value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} data-testid="cms-title" />
        <label>Body</label>
        <textarea value={pageBody} onChange={(e) => setPageBody(e.target.value)} rows={5} data-testid="cms-body" />
        <button className="btn" onClick={savePage} data-testid="cms-save" style={{ marginTop: '0.5rem' }}>Save page</button>
      </div>
    </div>
  );
}
