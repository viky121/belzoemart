'use client';

import {
  MOBILE_LIMITS,
  MOBILE_OFFER_ASPECT,
  MOBILE_OFFER_SIZE_HINT,
  type MobileOfferColumns,
  type MobileOfferPosition,
  type MobileOfferRow,
} from '@belzo/shared';
import { isUsableImageUrl } from '@/lib/category-theme';
import { safeUuid } from '@/lib/uuid';
import { BannerList, moveItem } from './banner-list';
import type { LinkCategory } from './link-field';

const POSITIONS: { value: MobileOfferPosition; label: string }[] = [
  { value: 'after_hero', label: 'Right below the main banner' },
  { value: 'after_categories', label: 'Below the category circles' },
  { value: 'after_deals', label: 'Below Deals of the Day' },
];

const COLUMNS: { value: MobileOfferColumns; label: string }[] = [
  { value: 1, label: '1 per row (full width)' },
  { value: 2, label: '2 per row' },
  { value: 3, label: '3 per row' },
];

/** Live preview of a row: the same column count and aspect ratio the app uses. */
function RowPreview({ row }: { row: MobileOfferRow }) {
  const shown = row.banners.filter((b) => b.enabled);
  if (shown.length === 0) return null;
  return (
    <div className="mh-preview" aria-label="Preview">
      <div className="mh-preview__grid" style={{ gridTemplateColumns: `repeat(${row.columns}, 1fr)` }}>
        {shown.map((b) => (
          <div className="mh-preview__cell" key={b.id} style={{ aspectRatio: String(MOBILE_OFFER_ASPECT[row.columns]) }}>
            {isUsableImageUrl(b.imageUrl) && b.imageUrl !== '#' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.imageUrl} alt="" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OfferRowsPanel({
  rows,
  onChange,
  categories,
}: {
  rows: MobileOfferRow[];
  onChange: (next: MobileOfferRow[]) => void;
  categories: LinkCategory[];
}) {
  const update = (i: number, patch: Partial<MobileOfferRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const add = () =>
    onChange([
      ...rows,
      {
        id: safeUuid(),
        title: '',
        columns: 2,
        position: 'after_categories',
        banners: [],
        enabled: true,
      },
    ]);

  return (
    <div>
      <p className="prod-form__hint">
        Add extra offer banners to the app home. Each row has its own layout: pick 1, 2 or 3 banners per row and where it
        appears. Add as many rows as you like.
      </p>
      {rows.map((r, i) => (
        <div className="ce-promo mh-row" key={r.id} data-testid={`mh-row-${i}`}>
          <div className="prod-grid">
            <div>
              <label className="auth-label">Row title (optional)</label>
              <input
                className="auth-input"
                maxLength={80}
                placeholder="e.g. Festive offers"
                value={r.title}
                onChange={(e) => update(i, { title: e.target.value })}
              />
            </div>
            <div>
              <label className="auth-label">Layout</label>
              <select
                className="auth-input"
                value={r.columns}
                onChange={(e) => update(i, { columns: Number(e.target.value) as MobileOfferColumns })}
              >
                {COLUMNS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="auth-label">Where it shows</label>
              <select
                className="auth-input"
                value={r.position}
                onChange={(e) => update(i, { position: e.target.value as MobileOfferPosition })}
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <RowPreview row={r} />

          <BannerList
            banners={r.banners}
            onChange={(banners) => update(i, { banners })}
            max={MOBILE_LIMITS.bannersPerRow}
            categories={categories}
            sizeHint={MOBILE_OFFER_SIZE_HINT[r.columns]}
            addLabel="+ Add banner to this row"
          />
          {r.banners.length > r.columns && (
            <p className="prod-form__hint">
              More than {r.columns} banner{r.columns === 1 ? '' : 's'}: they continue on the next line, {r.columns} per row.
            </p>
          )}

          <div className="mh-banner__bar" style={{ marginTop: 8 }}>
            <label className="mh-check">
              <input type="checkbox" checked={r.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
              Row enabled
            </label>
            <span className="mh-spacer" />
            <button type="button" className="wiz__vdel" disabled={i === 0} aria-label="Move row up" onClick={() => onChange(moveItem(rows, i, -1))}>
              ↑
            </button>
            <button
              type="button"
              className="wiz__vdel"
              disabled={i === rows.length - 1}
              aria-label="Move row down"
              onClick={() => onChange(moveItem(rows, i, 1))}
            >
              ↓
            </button>
            <button type="button" className="wiz__vdel" aria-label="Delete row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="wiz__addvar" disabled={rows.length >= MOBILE_LIMITS.offerRows} onClick={add}>
        + Add offer row {rows.length >= MOBILE_LIMITS.offerRows ? `(max ${MOBILE_LIMITS.offerRows})` : ''}
      </button>
    </div>
  );
}
