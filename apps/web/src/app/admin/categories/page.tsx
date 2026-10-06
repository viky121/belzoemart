'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, adminUpload } from '@/lib/admin-api';
import { MediaPicker } from '@/components/media-picker';

interface CatNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: CatNode[];
}

interface FlatOpt {
  id: string;
  label: string;
}

/** Flatten the tree into indented options for the parent dropdown. */
function flatten(nodes: CatNode[], depth = 0, out: FlatOpt[] = []): FlatOpt[] {
  for (const n of nodes) {
    out.push({ id: n.id, label: `${'— '.repeat(depth)}${n.name}` });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

const DEPTH_LABEL = ['Primary category', 'Sub-category', 'Final detail', 'Level 4'];

/** Admin category manager — build the primary → sub → final tree used everywhere. */
export default function AdminCategoriesPage() {
  const [tree, setTree] = useState<CatNode[]>([]);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParent, setEditParent] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editUploading, setEditUploading] = useState(false);

  // Which image field the media picker is choosing for (null = closed).
  const [pickFor, setPickFor] = useState<'add' | 'edit' | null>(null);

  function startEdit(n: CatNode, curParent: string) {
    setEditId(n.id);
    setEditName(n.name);
    setEditParent(curParent);
    setEditImage(n.imageUrl ?? '');
    setMsg(null);
  }

  async function uploadEditImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditUploading(true);
    try {
      const { url } = await adminUpload(file, 'categories');
      setEditImage(url);
    } finally {
      setEditUploading(false);
      e.target.value = '';
    }
  }

  async function saveEdit() {
    if (!editId || !editName.trim()) {
      setMsg('Category name is required.');
      return;
    }
    setBusy(true);
    try {
      await adminFetch('/admin/categories', {
        method: 'POST',
        body: { id: editId, name: editName.trim(), parentId: editParent || null, imageUrl: editImage || undefined },
      });
      setEditId(null);
      setMsg('Category updated.');
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update category.');
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    setTree(await adminFetch<CatNode[]>('/admin/categories').catch(() => [] as CatNode[]));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const options = flatten(tree);

  async function uploadImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await adminUpload(file, 'categories');
      setImageUrl(url);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function add() {
    setMsg(null);
    if (!name.trim()) {
      setMsg('Enter a category name.');
      return;
    }
    setBusy(true);
    try {
      await adminFetch('/admin/categories', {
        method: 'POST',
        body: { name: name.trim(), parentId: parentId || null, imageUrl: imageUrl || undefined },
      });
      setName('');
      setImageUrl('');
      setMsg('Category added.');
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add category.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete "${label}"?`)) return;
    try {
      await adminFetch(`/admin/categories/${id}`, { method: 'DELETE' });
      setMsg(`Deleted "${label}".`);
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not delete category.');
    }
  }

  function renderRows(nodes: CatNode[], depth = 0, parentId = ''): React.ReactNode {
    return nodes.map((n) => (
      <div key={n.id}>
        {editId === n.id ? (
          <div className="cat-row cat-row--editing" style={{ paddingLeft: 12 + depth * 22 }}>
            <span className="cat-row__dot" data-depth={depth} />
            <div className="cat-edit">
              <div className="cat-edit__fields">
                <div>
                  <label className="auth-label">Name *</label>
                  <input
                    className="auth-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    data-testid="category-edit-name"
                  />
                </div>
                <div>
                  <label className="auth-label">Parent</label>
                  <select
                    className="auth-input"
                    value={editParent}
                    onChange={(e) => setEditParent(e.target.value)}
                    data-testid="category-edit-parent"
                  >
                    <option value="">— Primary (top level) —</option>
                    {options
                      .filter((o) => o.id !== n.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="auth-label">Image (optional)</label>
                  <input type="file" accept="image/*" onChange={uploadEditImg} disabled={editUploading} />
                  <button
                    type="button"
                    className="mediapick__open"
                    onClick={() => setPickFor('edit')}
                    data-testid="category-edit-choose-library"
                  >
                    Choose from library
                  </button>
                  {editUploading && <span className="prod-form__hint"> Uploading…</span>}
                  {editImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editImage} alt="" style={{ height: 40, marginTop: 6, borderRadius: 6 }} />
                  )}
                </div>
              </div>
              <div className="cat-edit__actions">
                <button className="auth-btn" onClick={saveEdit} disabled={busy} data-testid="category-edit-save">
                  {busy ? 'Saving…' : 'Update'}
                </button>
                <button className="admin-inline-btn" onClick={() => setEditId(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="cat-row" style={{ paddingLeft: 12 + depth * 22 }}>
            <span className="cat-row__dot" data-depth={depth} />
            {n.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.imageUrl} className="cat-row__img" alt="" />
            ) : null}
            <span className="cat-row__name">{n.name}</span>
            <span className="cat-row__tag">{DEPTH_LABEL[depth] ?? `Level ${depth + 1}`}</span>
            <span className="cat-row__slug">/{n.slug}</span>
            <div className="cat-row__actions">
              <button
                className="admin-inline-btn cat-row__edit"
                onClick={() => startEdit(n, parentId)}
                data-testid="category-edit"
              >
                Edit
              </button>
              <button className="admin-inline-btn admin-btn--danger" onClick={() => remove(n.id, n.name)}>
                Delete
              </button>
            </div>
          </div>
        )}
        {n.children?.length ? renderRows(n.children, depth + 1, n.id) : null}
      </div>
    ));
  }

  return (
    <div data-testid="admin-categories">
      <h1>Categories</h1>
      <p className="admin-muted">
        Build the category tree: a <strong>Primary category</strong> (no parent), then{' '}
        <strong>Sub-categories</strong> under it, then <strong>Final detail</strong> categories.
        This is what the Add Product wizard&apos;s three columns use.
      </p>
      {msg && (
        <p role="status" className="catalogue-msg" data-testid="categories-msg">
          {msg}
        </p>
      )}

      <div className="ce-card" style={{ maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>Add category</h3>
        <div className="prod-grid">
          <div>
            <label className="auth-label">Name *</label>
            <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarees" />
          </div>
          <div>
            <label className="auth-label">Parent</label>
            <select className="auth-input" value={parentId} onChange={(e) => setParentId(e.target.value)} data-testid="category-parent">
              <option value="">— Primary (top level) —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="auth-label">Image (optional)</label>
            <input type="file" accept="image/*" onChange={uploadImg} disabled={uploading} />
            <button
              type="button"
              className="mediapick__open"
              onClick={() => setPickFor('add')}
              data-testid="category-add-choose-library"
            >
              Choose from library
            </button>
            {uploading && <span className="prod-form__hint"> Uploading…</span>}
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" style={{ height: 40, marginTop: 6, borderRadius: 6 }} />
            )}
          </div>
        </div>
        <button className="auth-btn" onClick={add} disabled={busy} data-testid="category-add" style={{ marginTop: 12 }}>
          {busy ? 'Adding…' : 'Add Category'}
        </button>
      </div>

      <h3 style={{ marginTop: '1.25rem' }}>Category tree</h3>
      <div className="cat-tree" data-testid="category-tree">
        {tree.length === 0 ? <p className="admin-muted">No categories yet.</p> : renderRows(tree)}
      </div>

      {pickFor && (
        <MediaPicker
          folder="categories"
          title="Choose category icon"
          onSelect={(url) => (pickFor === 'add' ? setImageUrl(url) : setEditImage(url))}
          onClose={() => setPickFor(null)}
        />
      )}
    </div>
  );
}
