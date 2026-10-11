'use client';

import { useMemo } from 'react';

export interface CategoryTreeNode {
  id: string;
  name: string;
  children?: CategoryTreeNode[];
}

/** Path of nodes from a root down to the node with `id` (empty if not found). */
export function categoryPath(nodes: CategoryTreeNode[], id: string): CategoryTreeNode[] {
  for (const n of nodes) {
    if (n.id === id) return [n];
    const sub = n.children?.length ? categoryPath(n.children, id) : [];
    if (sub.length) return [n, ...sub];
  }
  return [];
}

/**
 * Cascading category picker: Category → Sub-category → Final detail, with a
 * breadcrumb of the current selection. Picking a higher level selects that
 * level (deeper levels are optional), so a product can sit at any depth.
 */
export function CategoryPicker({
  tree,
  value,
  onChange,
}: {
  tree: CategoryTreeNode[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  const path = useMemo(() => categoryPath(tree, value), [tree, value]);
  const [l1, l2, l3] = path;
  const subs = l1?.children ?? [];
  const finals = l2?.children ?? [];
  const unknown = Boolean(value) && path.length === 0;

  return (
    <div className="catpick" data-testid="category-picker">
      <div className="catpick__row">
        <div className="catpick__col">
          <label className="auth-label">Category</label>
          <select
            className="auth-input"
            value={l1?.id ?? ''}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            data-testid="catpick-l1"
          >
            <option value="" disabled>
              Select category
            </option>
            {tree.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="catpick__col">
          <label className="auth-label">Sub-category</label>
          <select
            className="auth-input"
            value={l2?.id ?? ''}
            onChange={(e) => onChange(e.target.value || l1!.id)}
            disabled={!l1 || subs.length === 0}
            data-testid="catpick-l2"
          >
            <option value="">{subs.length ? '— none —' : 'No sub-categories'}</option>
            {subs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="catpick__col">
          <label className="auth-label">Final detail</label>
          <select
            className="auth-input"
            value={l3?.id ?? ''}
            onChange={(e) => onChange(e.target.value || l2!.id)}
            disabled={!l2 || finals.length === 0}
            data-testid="catpick-l3"
          >
            <option value="">{finals.length ? '— none —' : 'No further detail'}</option>
            {finals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="catpick__path" data-testid="catpick-path">
        {unknown ? (
          <span className="catpick__warn">⚠ Current category is inactive or missing — pick a new one.</span>
        ) : path.length ? (
          <>
            <span className="catpick__lbl">Selected:</span> {path.map((n) => n.name).join(' › ')}
          </>
        ) : (
          <span className="catpick__warn">No category selected.</span>
        )}
      </p>
    </div>
  );
}
