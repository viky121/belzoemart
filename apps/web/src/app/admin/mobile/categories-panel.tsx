'use client';

import type { CategoryNodeDto, MobileCategoryOverride } from '@belzo/shared';
import { isUsableImageUrl } from '@/lib/category-theme';
import { ImageDrop } from '../settings/image-drop';
import { moveItem } from './banner-list';

/**
 * One editable entry per top-level category, in display order: the admin's
 * arranged ones first, then any category not yet arranged (e.g. a brand-new one)
 * in tree order. Hidden entries are kept so they can be shown again.
 */
export function fullCategoryList(
  tree: CategoryNodeDto[],
  overrides: MobileCategoryOverride[],
): MobileCategoryOverride[] {
  const byId = new Set(tree.map((n) => n.id));
  const seen = new Set<string>();
  const out: MobileCategoryOverride[] = [];
  for (const o of overrides) {
    if (!byId.has(o.categoryId) || seen.has(o.categoryId)) continue;
    seen.add(o.categoryId);
    out.push(o);
  }
  for (const n of tree) {
    if (!seen.has(n.id)) out.push({ categoryId: n.id, name: '', iconUrl: '', hidden: false });
  }
  return out;
}

export function CategoriesPanel({
  tree,
  value,
  onChange,
}: {
  tree: CategoryNodeDto[];
  value: MobileCategoryOverride[];
  onChange: (next: MobileCategoryOverride[]) => void;
}) {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const update = (i: number, patch: Partial<MobileCategoryOverride>) =>
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  if (tree.length === 0) {
    return <p className="prod-form__hint">No categories yet. Add categories first under Catalog → Categories.</p>;
  }

  return (
    <div>
      <p className="prod-form__hint">
        These are the circles on the app home (4 per row). Reorder them, rename the label, upload a custom icon, or hide
        one. A category you add later appears automatically at the end.
      </p>
      {value.map((c, i) => {
        const node = byId.get(c.categoryId);
        if (!node) return null;
        const icon = c.iconUrl || node.imageUrl || '';
        return (
          <div className={`mh-cat${c.hidden ? ' mh-cat--off' : ''}`} key={c.categoryId} data-testid={`mh-cat-${i}`}>
            <div className="mh-cat__preview" aria-hidden="true">
              {isUsableImageUrl(icon) && icon !== '#' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" />
              ) : (
                <span>{(c.name || node.name).slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="mh-cat__body">
              <strong>{node.name}</strong>
              <label className="auth-label">Label in app</label>
              <input
                className="auth-input"
                maxLength={40}
                placeholder={node.name}
                value={c.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <ImageDrop
                folder="categories"
                previewHeight={48}
                label="Icon (square PNG, 200 × 200 px)"
                value={c.iconUrl}
                onChange={(url) => update(i, { iconUrl: url })}
              />
              {c.iconUrl && (
                <button type="button" className="mh-link-btn" onClick={() => update(i, { iconUrl: '' })}>
                  Remove custom icon{node.imageUrl ? ' (use category image)' : ' (use built-in icon)'}
                </button>
              )}
            </div>
            <div className="mh-cat__side">
              <label className="mh-check">
                <input type="checkbox" checked={!c.hidden} onChange={(e) => update(i, { hidden: !e.target.checked })} />
                Show
              </label>
              <button type="button" className="wiz__vdel" disabled={i === 0} aria-label={`Move ${node.name} up`} onClick={() => onChange(moveItem(value, i, -1))}>
                ↑
              </button>
              <button
                type="button"
                className="wiz__vdel"
                disabled={i === value.length - 1}
                aria-label={`Move ${node.name} down`}
                onClick={() => onChange(moveItem(value, i, 1))}
              >
                ↓
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
