'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import {
  homeSectionSchema,
  homeSectionsSchema,
  HOME_SECTION_SORTS,
  type HomeSection,
  type HomeSectionSource,
  type CategoryNodeDto,
} from '@belzo/shared';
import { DEFAULT_SECTIONS } from '@/lib/home-sections';

/** Admin product row shape (subset of the admin product list we need here). */
interface ProdRow {
  id: string;
  title: string;
  imageUrl: string | null;
}

const SORT_LABELS: Record<(typeof HOME_SECTION_SORTS)[number], string> = {
  discount: 'Biggest discount',
  newest: 'Newest',
  popularity: 'Most popular',
  rating: 'Top rated',
};

/** Flatten the nested category tree into indented options for a <select>. */
function flattenCategories(nodes: CategoryNodeDto[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenCategories(n.children ?? [], depth + 1),
  ]);
}

/** Seed editor state from stored sections, falling back to defaults. */
function seedSections(stored: unknown): HomeSection[] {
  const raw = Array.isArray(stored) ? stored : [];
  const valid = raw
    .map((s) => homeSectionSchema.safeParse(s))
    .filter((r): r is { success: true; data: HomeSection } => r.success)
    .map((r) => r.data);
  return valid.length > 0 ? valid : DEFAULT_SECTIONS.map((s) => ({ ...s }));
}

/** Admin manager for the shared home-page sections (both storefront themes). */
export function HomeSectionsEditor() {
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [products, setProducts] = useState<ProdRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void adminFetch<Record<string, unknown>>('/admin/settings')
      .then((s) => setSections(seedSections(s['home.sections'])))
      .catch(() => setSections(DEFAULT_SECTIONS.map((x) => ({ ...x }))));
    void adminFetch<CategoryNodeDto[]>('/categories')
      .then((tree) => setCategories(flattenCategories(tree)))
      .catch(() => undefined);
    void adminFetch<ProdRow[]>('/admin/products')
      .then((rows) => setProducts(rows.map((r) => ({ id: r.id, title: r.title, imageUrl: r.imageUrl }))))
      .catch(() => undefined);
  }, []);

  const update = (i: number, patch: Partial<HomeSection>) =>
    setSections((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const setSource = (i: number, source: HomeSectionSource) => update(i, { source });

  const swap = (i: number, j: number) =>
    setSections((list) => {
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const remove = (i: number) => setSections((list) => list.filter((_, j) => j !== i));

  const add = () =>
    setSections((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        title: 'New section',
        source: { type: 'sort', sort: 'discount' },
        limit: 12,
        enabled: true,
      },
    ]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const parsed = homeSectionsSchema.safeParse(sections);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setMsg(`Cannot save: ${first ? `${first.path.join('.')} — ${first.message}` : 'invalid sections'}.`);
      setBusy(false);
      return;
    }
    try {
      await adminFetch('/admin/settings', {
        method: 'PUT',
        body: { key: 'home.sections', value: parsed.data },
      });
      setMsg('Home sections saved. Live on the storefront.');
    } catch {
      setMsg('Could not save home sections.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ce-card">
      <h2>🧩 Home sections</h2>
      <p className="prod-form__hint">
        These named product rails appear on the storefront home page in both themes, in this order.
      </p>
      {msg && <p role="status" className="prod-form__msg">{msg}</p>}

      {sections.map((s, i) => (
        <SectionRow
          key={s.id}
          index={i}
          total={sections.length}
          section={s}
          categories={categories}
          products={products}
          onChange={(patch) => update(i, patch)}
          onSource={(src) => setSource(i, src)}
          onUp={() => swap(i, i - 1)}
          onDown={() => swap(i, i + 1)}
          onDelete={() => remove(i)}
        />
      ))}

      <button type="button" className="wiz__addvar" onClick={add}>
        + Add section
      </button>

      <div style={{ marginTop: 14 }}>
        <button className="auth-btn" disabled={busy} onClick={save} data-testid="save-home-sections">
          {busy ? 'Saving…' : 'Save Home Sections'}
        </button>
      </div>
    </section>
  );
}

interface SectionRowProps {
  index: number;
  total: number;
  section: HomeSection;
  categories: { id: string; label: string }[];
  products: ProdRow[];
  onChange: (patch: Partial<HomeSection>) => void;
  onSource: (source: HomeSectionSource) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}

function SectionRow({
  index,
  total,
  section,
  categories,
  products,
  onChange,
  onSource,
  onUp,
  onDown,
  onDelete,
}: SectionRowProps) {
  const [filter, setFilter] = useState('');

  const picked = section.source.type === 'manual' ? section.source.productIds : [];
  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.title.toLowerCase().includes(q) && !picked.includes(p.id))
      .slice(0, 8);
  }, [filter, products, picked]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const addProduct = (id: string) =>
    onSource({ type: 'manual', productIds: [...picked, id] });
  const removeProduct = (id: string) =>
    onSource({ type: 'manual', productIds: picked.filter((x) => x !== id) });
  const moveProduct = (i: number, j: number) => {
    if (j < 0 || j >= picked.length) return;
    const next = [...picked];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onSource({ type: 'manual', productIds: next });
  };

  const changeType = (type: HomeSectionSource['type']) => {
    if (type === 'sort') onSource({ type: 'sort', sort: 'discount' });
    else if (type === 'category') onSource({ type: 'category', categoryId: categories[0]?.id ?? '' });
    else onSource({ type: 'manual', productIds: [] });
  };

  return (
    <div className="ce-promo">
      <div className="prod-grid">
        <div>
          <label className="auth-label">Title</label>
          <input
            className="auth-input"
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
        <div>
          <label className="auth-label">Items to show</label>
          <input
            className="auth-input"
            type="number"
            min={2}
            max={24}
            value={section.limit}
            onChange={(e) =>
              onChange({ limit: Math.max(2, Math.min(24, Number(e.target.value) || 2)) })
            }
          />
        </div>
        <div>
          <label className="auth-label">Source</label>
          <select
            className="auth-input"
            value={section.source.type}
            onChange={(e) => changeType(e.target.value as HomeSectionSource['type'])}
          >
            <option value="sort">By sort</option>
            <option value="category">By category</option>
            <option value="manual">Manual pick</option>
          </select>
        </div>
        <div>
          {section.source.type === 'sort' && (
            <>
              <label className="auth-label">Sort by</label>
              <select
                className="auth-input"
                value={section.source.sort}
                onChange={(e) =>
                  onSource({ type: 'sort', sort: e.target.value as (typeof HOME_SECTION_SORTS)[number] })
                }
              >
                {HOME_SECTION_SORTS.map((v) => (
                  <option key={v} value={v}>
                    {SORT_LABELS[v]}
                  </option>
                ))}
              </select>
            </>
          )}
          {section.source.type === 'category' && (
            <>
              <label className="auth-label">Category</label>
              <select
                className="auth-input"
                value={section.source.categoryId}
                onChange={(e) => onSource({ type: 'category', categoryId: e.target.value })}
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {section.source.type === 'manual' && (
        <div style={{ marginTop: 8 }}>
          <label className="auth-label">Pick products (search by title)</label>
          <input
            className="auth-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Type to search products…"
          />
          {matches.length > 0 && (
            <div className="prod-grid" style={{ marginTop: 6 }}>
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="wiz__addvar"
                  onClick={() => {
                    addProduct(p.id);
                    setFilter('');
                  }}
                >
                  + {p.title}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            {picked.length === 0 && (
              <span className="prod-form__hint">No products picked yet — add at least one.</span>
            )}
            {picked.map((id, pi) => {
              const p = byId.get(id);
              return (
                <div className="ce-why" key={id}>
                  <span style={{ flex: 1 }}>{p ? p.title : id}</span>
                  <button
                    type="button"
                    className="wiz__vdel"
                    onClick={() => moveProduct(pi, pi - 1)}
                    disabled={pi === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="wiz__vdel"
                    onClick={() => moveProduct(pi, pi + 1)}
                    disabled={pi === picked.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="wiz__vdel"
                    onClick={() => removeProduct(id)}
                    aria-label="Remove product"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ce-why" style={{ marginTop: 8 }}>
        <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={section.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          Enabled
        </label>
        <button
          type="button"
          className="wiz__vdel"
          onClick={onUp}
          disabled={index === 0}
          aria-label="Move section up"
        >
          ↑
        </button>
        <button
          type="button"
          className="wiz__vdel"
          onClick={onDown}
          disabled={index === total - 1}
          aria-label="Move section down"
        >
          ↓
        </button>
        <button type="button" className="wiz__vdel" onClick={onDelete} aria-label="Delete section">
          ✕
        </button>
      </div>
    </div>
  );
}
