'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CategoryNodeDto } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';
import { safeUuid } from '@/lib/uuid';
import type { LinkCategory } from '../mobile/link-field';
import type { ProdRow } from '../settings/home-sections-editor';
import {
  ADD_OPTIONS,
  addSection,
  canRemove,
  designPayload,
  isDirty,
  isOn,
  itemInfo,
  moveSection,
  removeSection,
  setOn,
  validateDesign,
  type AddKind,
  type DesignState,
} from './home-design';
import { BlockEditor, InfoNote, OfferEditor, ProductEditor, PromosEditor, WhyEditor } from './section-editors';

interface DesignResponse extends DesignState {
  theme: 'classic' | 'emart';
}

type Msg = { text: string; ok: boolean } | null;

function flattenForLinks(nodes: CategoryNodeDto[], depth = 0): LinkCategory[] {
  return nodes.flatMap((n) => [
    { slug: n.slug, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenForLinks(n.children ?? [], depth + 1),
  ]);
}

function flattenWithIds(nodes: CategoryNodeDto[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenWithIds(n.children ?? [], depth + 1),
  ]);
}

function stripTheme(d: DesignResponse): DesignState {
  return {
    layout: d.layout,
    productSections: d.productSections,
    offerRows: d.offerRows,
    blocks: d.blocks,
    promos: d.promos,
    why: d.why,
  };
}

/**
 * Admin → Pages → Home page design. Every section of the website home page is a card: drag it
 * (or use ↑ ↓) to reorder, switch it on or off, edit what it shows, or add new sections.
 * Nothing changes on the website until Save.
 */
export function HomeDesigner() {
  const [saved, setSaved] = useState<DesignState | null>(null);
  const [state, setState] = useState<DesignState | null>(null);
  const [theme, setTheme] = useState<'classic' | 'emart'>('emart');
  const [tree, setTree] = useState<CategoryNodeDto[]>([]);
  const [products, setProducts] = useState<ProdRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try {
      const d = await adminFetch<DesignResponse>('/admin/home-design');
      setTheme(d.theme);
      setSaved(stripTheme(d));
      setState(stripTheme(d));
      setLoadError(null);
    } catch {
      setLoadError('Could not load the home page design. You may not have access (Marketing role required).');
    }
  }, []);

  useEffect(() => {
    void load();
    void adminFetch<CategoryNodeDto[]>('/categories').then(setTree).catch(() => undefined);
    // Only used to search products for a hand-picked section; fine if the role can't list products.
    void adminFetch<ProdRow[]>('/admin/products')
      .then((rows) => setProducts(rows.map((r) => ({ id: r.id, title: r.title, imageUrl: r.imageUrl }))))
      .catch(() => undefined);
  }, [load]);

  const dirty = isDirty(state, saved);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const linkCats = useMemo(() => flattenForLinks(tree), [tree]);
  const catOptions = useMemo(() => flattenWithIds(tree), [tree]);

  const change = useCallback((fn: (s: DesignState) => DesignState) => {
    setState((s) => (s ? fn(s) : s));
    setMsg(null);
  }, []);

  // ── drag & drop (the ↑ ↓ buttons do the same for keyboard and touch) ──
  function endDrag() {
    setDragIdx(null);
    setOverIdx(null);
  }
  function onDrop(i: number, e: React.DragEvent) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== i) change((s) => moveSection(s, dragIdx, i));
    endDrag();
  }

  function add(kind: AddKind) {
    if (!state) return;
    const r = addSection(state, kind, safeUuid);
    if ('error' in r) {
      setMsg({ text: r.error, ok: false });
      return;
    }
    setState(r.state);
    setOpenId(r.id);
    setShowAdd(false);
    setMsg({ text: 'Section added at the bottom. Fill it in, then drag it where you want it.', ok: true });
  }

  async function save() {
    if (!state) return;
    const problem = validateDesign(state);
    if (problem) {
      setMsg({ text: `Cannot save: ${problem}`, ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const d = await adminFetch<DesignResponse>('/admin/home-design', { method: 'PUT', body: designPayload(state) });
      setSaved(stripTheme(d));
      setState(stripTheme(d));
      setOpenId(null);
      setMsg({ text: 'Saved. The website home page now follows this design.', ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message ? e.message : 'Could not save. Try again.', ok: false });
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (dirty && !window.confirm('Throw away your unsaved changes?')) return;
    setState(saved);
    setOpenId(null);
    setMsg(null);
  }

  if (loadError) {
    return (
      <p role="alert" className="prod-form__msg">
        {loadError}
      </p>
    );
  }
  if (!state) return <p>Loading…</p>;

  return (
    <div className="hd" data-testid="home-designer">
      <div className="mh-head">
        <div>
          <p className="prod-form__hint">
            Every block of the website home page is a card below. <strong>Drag a card</strong> by its ⠿ handle (or use
            ↑ ↓) to change the order, switch it on or off, press <strong>Edit</strong> to change what it shows, or add a
            new section. Nothing changes on the website until you press Save.
          </p>
          {theme !== 'emart' && (
            <p className="prod-form__hint" role="note">
              Note: the website currently uses the “{theme}” theme, which keeps its own fixed order. This design applies
              to the eMart theme.
            </p>
          )}
        </div>
        <div className="mh-save">
          {dirty && <span className="mh-dirty">Unsaved changes</span>}
          <a href="/" target="_blank" rel="noreferrer" className="mh-link-btn">
            View website ↗
          </a>
          <button type="button" className="mh-link-btn" disabled={!dirty || busy} onClick={discard}>
            Discard
          </button>
          <button type="button" className="auth-btn" disabled={!dirty || busy} onClick={() => void save()} data-testid="hd-save">
            {busy ? 'Saving…' : 'Save design'}
          </button>
        </div>
      </div>

      {msg && (
        <p role="status" className={`mh-msg${msg.ok ? ' mh-msg--ok' : ' mh-msg--bad'}`} data-testid="hd-msg">
          {msg.text}
        </p>
      )}

      <ol className="hd-list" aria-label="Home page sections, top to bottom">
        {state.layout.map((item, i) => {
          const info = itemInfo(state, item);
          const on = isOn(state, item);
          const open = openId === item.id;
          const removable = canRemove(state, item);
          const cls = [
            'hd-item',
            on ? '' : 'hd-item--off',
            dragIdx === i ? 'hd-item--dragging' : '',
            overIdx === i && dragIdx !== null && dragIdx !== i ? (dragIdx < i ? 'hd-item--over-after' : 'hd-item--over-before') : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li
              key={item.id}
              className={cls}
              data-testid={`hd-item-${item.id}`}
              onDragOver={(e) => {
                if (dragIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overIdx !== i) setOverIdx(i);
              }}
              onDrop={(e) => onDrop(i, e)}
            >
              <div
                className="hd-row"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item.id);
                  setDragIdx(i);
                }}
                onDragEnd={endDrag}
              >
                <span className="hd-handle" title="Drag to move" aria-hidden="true">
                  ⠿
                </span>
                <span className="hd-ic" aria-hidden="true">
                  {info.icon}
                </span>
                <div className="hd-main">
                  <strong>{info.title}</strong>
                  <span>{info.subtitle}</span>
                </div>

                <label className="hd-switch">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => change((s) => setOn(s, item.id, e.target.checked))}
                    aria-label={`Show “${info.title}” on the website`}
                    data-testid={`hd-switch-${item.id}`}
                  />
                  <span>{on ? 'Shown' : 'Hidden'}</span>
                </label>

                <div className="hd-actions">
                  <button
                    type="button"
                    className="hd-btn"
                    aria-label={`Move “${info.title}” up`}
                    disabled={i === 0}
                    onClick={() => change((s) => moveSection(s, i, i - 1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="hd-btn"
                    aria-label={`Move “${info.title}” down`}
                    disabled={i === state.layout.length - 1}
                    onClick={() => change((s) => moveSection(s, i, i + 1))}
                  >
                    ↓
                  </button>
                  {info.editable && (
                    <button
                      type="button"
                      className={`hd-btn hd-btn--text${open ? ' hd-btn--on' : ''}`}
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : item.id)}
                      data-testid={`hd-edit-${item.id}`}
                    >
                      {open ? 'Close' : 'Edit'}
                    </button>
                  )}
                  {removable && (
                    <button
                      type="button"
                      className="hd-btn hd-btn--danger"
                      aria-label={`Delete “${info.title}”`}
                      onClick={() => {
                        if (!window.confirm(`Delete “${info.title}”? It disappears from the website and the app.`)) return;
                        change((s) => removeSection(s, item.id));
                        setOpenId(null);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {open && (
                <div className="hd-editor" data-testid={`hd-editor-${item.id}`}>
                  {item.kind === 'products' && (() => {
                    const section = state.productSections.find((x) => x.id === item.refId);
                    return section ? (
                      <ProductEditor
                        section={section}
                        categories={catOptions}
                        products={products}
                        onChange={(next) =>
                          change((s) => ({ ...s, productSections: s.productSections.map((x) => (x.id === next.id ? next : x)) }))
                        }
                      />
                    ) : null;
                  })()}
                  {item.kind === 'offers' && (() => {
                    const row = state.offerRows.find((x) => x.id === item.refId);
                    return row ? (
                      <OfferEditor
                        row={row}
                        categories={linkCats}
                        onChange={(next) =>
                          change((s) => ({ ...s, offerRows: s.offerRows.map((x) => (x.id === next.id ? next : x)) }))
                        }
                      />
                    ) : null;
                  })()}
                  {item.kind === 'block' && (() => {
                    const block = state.blocks.find((x) => x.id === item.refId);
                    return block ? (
                      <BlockEditor
                        block={block}
                        categories={linkCats}
                        onChange={(next) =>
                          change((s) => ({ ...s, blocks: s.blocks.map((x) => (x.id === next.id ? next : x)) }))
                        }
                      />
                    ) : null;
                  })()}
                  {item.kind === 'promos' && (
                    <PromosEditor promos={state.promos} categories={linkCats} onChange={(promos) => change((s) => ({ ...s, promos }))} />
                  )}
                  {item.kind === 'why' && <WhyEditor items={state.why} onChange={(why) => change((s) => ({ ...s, why }))} />}
                  {(item.kind === 'hero' || item.kind === 'categories' || item.kind === 'brands') && <InfoNote kind={item.kind} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="hd-add">
        <button type="button" className="wiz__addvar" aria-expanded={showAdd} onClick={() => setShowAdd((v) => !v)} data-testid="hd-add">
          + Add a section
        </button>
        {showAdd && (
          <div className="hd-add__menu" role="menu">
            {ADD_OPTIONS.map((o) => (
              <button key={o.kind} type="button" role="menuitem" className="hd-add__opt" onClick={() => add(o.kind)} data-testid={`hd-add-${o.kind}`}>
                <span aria-hidden="true">{o.icon}</span>
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.hint}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
