'use client';

import type { MobileBanner } from '@belzo/shared';
import { safeUuid } from '@/lib/uuid';
import { ImageDrop } from '../settings/image-drop';
import { LinkField, type LinkCategory } from './link-field';

/** Move item i by delta within a list (no-op at the edges). */
export function moveItem<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function newBanner(): MobileBanner {
  return { id: safeUuid(), imageUrl: '', linkUrl: '#', title: '', enabled: true };
}

/** Editable list of banners (image, tap action, label, on/off, order). Used for hero + offer rows. */
export function BannerList({
  banners,
  onChange,
  max,
  categories,
  addLabel = '+ Add banner',
  sizeHint,
}: {
  banners: MobileBanner[];
  onChange: (next: MobileBanner[]) => void;
  max: number;
  categories: LinkCategory[];
  addLabel?: string;
  sizeHint?: string;
}) {
  const update = (i: number, patch: Partial<MobileBanner>) =>
    onChange(banners.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <div className="mh-banners">
      {banners.length === 0 && <p className="prod-form__hint">No banners yet.</p>}
      {banners.map((b, i) => (
        <div className="mh-banner" key={b.id} data-testid={`mh-banner-${i}`}>
          <div className="mh-banner__img">
            <ImageDrop
              value={b.imageUrl}
              onChange={(url) => update(i, { imageUrl: url })}
              label={sizeHint ? `Image (${sizeHint})` : 'Image'}
            />
            {b.imageUrl === '' && <span className="mh-warn">Image required — banner is hidden until set.</span>}
          </div>
          <div className="mh-banner__fields">
            <LinkField value={b.linkUrl} onChange={(v) => update(i, { linkUrl: v })} categories={categories} />
            <label className="auth-label">Label (optional, read by screen readers)</label>
            <input
              className="auth-input"
              maxLength={120}
              value={b.title}
              onChange={(e) => update(i, { title: e.target.value })}
            />
            <div className="mh-banner__bar">
              <label className="mh-check">
                <input type="checkbox" checked={b.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
                Show in app
              </label>
              <span className="mh-spacer" />
              <button type="button" className="wiz__vdel" disabled={i === 0} aria-label="Move up" onClick={() => onChange(moveItem(banners, i, -1))}>
                ↑
              </button>
              <button
                type="button"
                className="wiz__vdel"
                disabled={i === banners.length - 1}
                aria-label="Move down"
                onClick={() => onChange(moveItem(banners, i, 1))}
              >
                ↓
              </button>
              <button type="button" className="wiz__vdel" aria-label="Delete banner" onClick={() => onChange(banners.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="wiz__addvar" disabled={banners.length >= max} onClick={() => onChange([...banners, newBanner()])}>
        {addLabel} {banners.length >= max ? `(max ${max})` : ''}
      </button>
    </div>
  );
}
