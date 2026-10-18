'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseCmsBody } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';
import { EMPTY_PAGE, suggestSlug, toPayload, validatePage, type PageForm } from './page-form';

interface CmsPageRow {
  id: string;
  slug: string;
  title: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
}

type Msg = { text: string; ok: boolean } | null;

function Preview({ body }: { body: string }) {
  const blocks = parseCmsBody(body);
  if (blocks.length === 0) return <p className="pgs-hint">Nothing to preview yet.</p>;
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: number) => {
    if (bullets.length) {
      out.push(
        <ul key={`ul${key}`}>
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  blocks.forEach((b, i) => {
    if (b.type === 'bullet') {
      bullets.push(b.text);
      return;
    }
    flush(i);
    out.push(b.type === 'heading' ? <h4 key={i}>{b.text}</h4> : <p key={i}>{b.text}</p>);
  });
  flush(blocks.length);
  return <div className="pgs-preview">{out}</div>;
}

/**
 * Admin "Pages": every page of the website and app (About, Contact, the legal
 * policies, anything you add) in one place. Edit the text, or switch a page off to
 * take it down from the website and the app until you switch it back on.
 */
export function PagesManager() {
  const [pages, setPages] = useState<CmsPageRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ form: PageForm; isNew: boolean; original: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try {
      setPages(await adminFetch<CmsPageRow[]>('/admin/cms/pages'));
      setLoadError(null);
    } catch {
      setLoadError('Could not load the pages. You may not have access (Marketing role required).');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const taken = useMemo(() => (pages ?? []).map((p) => p.slug), [pages]);
  const dirty = editing !== null && JSON.stringify(editing.form) !== editing.original;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  function startEdit(p: CmsPageRow) {
    const form = { slug: p.slug, title: p.title, body: p.body, isActive: p.isActive };
    setEditing({ form, isNew: false, original: JSON.stringify(form) });
    setShowPreview(false);
    setMsg(null);
  }

  function startNew() {
    setEditing({ form: { ...EMPTY_PAGE }, isNew: true, original: JSON.stringify(EMPTY_PAGE) });
    setShowPreview(false);
    setMsg(null);
  }

  function cancelEdit() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    setEditing(null);
  }

  const patch = (p: Partial<PageForm>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...p } } : e));

  async function save() {
    if (!editing) return;
    const problem = validatePage(editing.form, { isNew: editing.isNew, takenSlugs: taken });
    if (problem) {
      setMsg({ text: problem, ok: false });
      return;
    }
    setBusy('save');
    setMsg(null);
    try {
      const saved = await adminFetch<CmsPageRow>('/admin/cms/pages', { method: 'POST', body: toPayload(editing.form) });
      await load();
      setEditing(null);
      setMsg({
        text: saved.isActive
          ? `Saved. “${saved.title}” is live on the website and app.`
          : `Saved. “${saved.title}” is switched off, so visitors can't see it.`,
        ok: true,
      });
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message ? e.message : 'Could not save. Try again.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function toggle(p: CmsPageRow) {
    const next = !p.isActive;
    if (!next && !window.confirm(`Switch off “${p.title}”? It will disappear from the website and the app.`)) return;
    setBusy(p.slug);
    setMsg(null);
    try {
      await adminFetch(`/admin/cms/pages/${encodeURIComponent(p.slug)}/active`, {
        method: 'PATCH',
        body: { isActive: next },
      });
      await load();
      setMsg({ text: next ? `“${p.title}” is now live.` : `“${p.title}” is switched off.`, ok: true });
    } catch {
      setMsg({ text: 'Could not change the page. Try again.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="prod-form__msg">
        {loadError}
      </p>
    );
  }
  if (!pages) return <p>Loading…</p>;

  return (
    <div className="pgs" data-testid="admin-pages">
      <div className="mh-head">
        <div>
          <p className="prod-form__hint">
            About, Contact and the policy pages shown on the website and in the app. Edit the text, or switch a page
            off to hide it.
          </p>
        </div>
        {!editing && (
          <button type="button" className="auth-btn" onClick={startNew} data-testid="page-new">
            + New page
          </button>
        )}
      </div>

      {msg && (
        <p role="status" className={`mh-msg${msg.ok ? ' mh-msg--ok' : ' mh-msg--bad'}`} data-testid="pages-msg">
          {msg.text}
        </p>
      )}

      {editing ? (
        <section className="ce-card pgs-editor" data-testid="page-editor">
          <h2>{editing.isNew ? 'New page' : `Edit: ${editing.form.title || editing.form.slug}`}</h2>

          <label htmlFor="pg-title" className="auth-label">
            Title
          </label>
          <input
            id="pg-title"
            className="auth-input"
            maxLength={160}
            value={editing.form.title}
            onChange={(e) =>
              patch({
                title: e.target.value,
                ...(editing.isNew && editing.form.slug === suggestSlug(editing.form.title)
                  ? { slug: suggestSlug(e.target.value) }
                  : {}),
              })
            }
          />

          <label htmlFor="pg-slug" className="auth-label">
            Web address
          </label>
          <div className="pgs-slug">
            <span>/page/</span>
            <input
              id="pg-slug"
              className="auth-input"
              maxLength={80}
              value={editing.form.slug}
              disabled={!editing.isNew}
              onChange={(e) => patch({ slug: e.target.value.toLowerCase() })}
              placeholder="refund-policy"
            />
          </div>
          {!editing.isNew && (
            <span className="pgs-hint">The address can&apos;t be changed after the page is created.</span>
          )}

          <label htmlFor="pg-body" className="auth-label">
            Text
          </label>
          <textarea
            id="pg-body"
            className="auth-input pgs-body"
            rows={22}
            value={editing.form.body}
            onChange={(e) => patch({ body: e.target.value })}
            spellCheck
          />
          <span className="pgs-hint">
            Start a line with <code>## </code> for a section heading and <code>- </code> for a bullet point. Any other
            line is a paragraph. Plain text only.
          </span>

          <label className="mh-check">
            <input type="checkbox" checked={editing.form.isActive} onChange={(e) => patch({ isActive: e.target.checked })} />
            Show this page on the website and app
          </label>

          <div className="pgs-actions">
            <button type="button" className="auth-btn" disabled={busy !== null} onClick={() => void save()} data-testid="page-save">
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="mh-link-btn" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide preview' : 'Preview'}
            </button>
            <button type="button" className="mh-link-btn" disabled={busy !== null} onClick={cancelEdit}>
              Cancel
            </button>
            {dirty && <span className="mh-dirty">Unsaved changes</span>}
          </div>

          {showPreview && (
            <div className="pgs-previewbox">
              <h3>{editing.form.title || 'Untitled'}</h3>
              <Preview body={editing.form.body} />
            </div>
          )}
        </section>
      ) : (
        <section className="admin-card">
          <table className="admin-table" data-testid="pages-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Address</th>
                <th>Status</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pages.length === 0 && (
                <tr>
                  <td colSpan={5}>No pages yet. Add one with “New page”.</td>
                </tr>
              )}
              {pages.map((p) => (
                <tr key={p.slug} data-testid={`page-row-${p.slug}`}>
                  <td>
                    <strong>{p.title}</strong>
                  </td>
                  <td>
                    {p.isActive ? (
                      <a href={`/page/${p.slug}`} target="_blank" rel="noreferrer">
                        /page/{p.slug}
                      </a>
                    ) : (
                      <span>/page/{p.slug}</span>
                    )}
                  </td>
                  <td>
                    <span className={`admin-status ${p.isActive ? 'admin-status--ok' : 'admin-status--warn'}`} data-testid={`page-status-${p.slug}`}>
                      {p.isActive ? 'Live' : 'Switched off'}
                    </span>
                  </td>
                  <td>{new Date(p.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="pgs-rowactions">
                    <button type="button" className="mh-link-btn" onClick={() => startEdit(p)} data-testid={`page-edit-${p.slug}`}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="mh-link-btn"
                      disabled={busy === p.slug}
                      onClick={() => void toggle(p)}
                      data-testid={`page-toggle-${p.slug}`}
                    >
                      {p.isActive ? 'Switch off' : 'Switch on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
