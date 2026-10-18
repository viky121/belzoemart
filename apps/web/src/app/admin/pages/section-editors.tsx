'use client';

import Link from 'next/link';
import {
  MOBILE_LIMITS,
  MOBILE_OFFER_COLUMNS,
  MOBILE_OFFER_POSITIONS,
  MOBILE_OFFER_SIZE_HINT,
  PROMO_COLORS,
  promoImage,
  type HomeBlock,
  type HomeBlockCard,
  type HomeSection,
  type HomeSectionSource,
  type MobileOfferColumns,
  type MobileOfferPosition,
  type MobileOfferRow,
  type PromoContent,
  type WhyItem,
} from '@belzo/shared';
import { BannerList } from '../mobile/banner-list';
import { LinkField, type LinkCategory } from '../mobile/link-field';
import { ImageDrop } from '../settings/image-drop';
import { SectionRow, type ProdRow } from '../settings/home-sections-editor';
import { LIMITS } from './home-design';

/** Recommended size of a promo-tile picture (the tile is about 16:7). */
export const PROMO_IMAGE_SIZE = '800 × 350 px';

const POSITION_LABEL: Record<MobileOfferPosition, string> = {
  after_hero: 'Right below the main banner',
  after_categories: 'Below the category circles',
  after_deals: 'Below Deals of the Day',
};

// ───────────────────────── product section ─────────────────────────

export function ProductEditor({
  section,
  onChange,
  categories,
  products,
}: {
  section: HomeSection;
  onChange: (next: HomeSection) => void;
  categories: { id: string; label: string }[];
  products: ProdRow[];
}) {
  return (
    <SectionRow
      compact
      section={section}
      categories={categories}
      products={products}
      onChange={(patch: Partial<HomeSection>) => onChange({ ...section, ...patch })}
      onSource={(source: HomeSectionSource) => onChange({ ...section, source })}
    />
  );
}

// ───────────────────────── offer banners ─────────────────────────

export function OfferEditor({
  row,
  onChange,
  categories,
}: {
  row: MobileOfferRow;
  onChange: (next: MobileOfferRow) => void;
  categories: LinkCategory[];
}) {
  return (
    <div className="hd-fields">
      <label className="auth-label">Heading above the banners (optional)</label>
      <input
        className="auth-input"
        maxLength={80}
        value={row.title}
        onChange={(e) => onChange({ ...row, title: e.target.value })}
        style={{ maxWidth: 420 }}
      />

      <label className="auth-label">Banners per line</label>
      <select
        className="auth-input"
        value={row.columns}
        onChange={(e) => onChange({ ...row, columns: Number(e.target.value) as MobileOfferColumns })}
        style={{ maxWidth: 420 }}
      >
        {MOBILE_OFFER_COLUMNS.map((c) => (
          <option key={c} value={c}>
            {c} per line (image {MOBILE_OFFER_SIZE_HINT[c]})
          </option>
        ))}
      </select>
      <span className="prod-form__hint">
        More banners than fit on a line continue on the next line, so 4 banners at “2 per line” make two lines.
      </span>

      <label className="auth-label">Where it sits in the app</label>
      <select
        className="auth-input"
        value={row.position}
        onChange={(e) => onChange({ ...row, position: e.target.value as MobileOfferPosition })}
        style={{ maxWidth: 420 }}
      >
        {MOBILE_OFFER_POSITIONS.map((p) => (
          <option key={p} value={p}>
            {POSITION_LABEL[p]}
          </option>
        ))}
      </select>
      <span className="prod-form__hint">On the website this row sits where you drag it on this page.</span>

      <BannerList
        banners={row.banners}
        onChange={(banners) => onChange({ ...row, banners })}
        max={MOBILE_LIMITS.bannersPerRow}
        categories={categories}
        sizeHint={MOBILE_OFFER_SIZE_HINT[row.columns]}
      />
    </div>
  );
}

// ───────────────────────── banner / cards blocks ─────────────────────────

export function BlockEditor({
  block,
  onChange,
  categories,
}: {
  block: HomeBlock;
  onChange: (next: HomeBlock) => void;
  categories: LinkCategory[];
}) {
  if (block.type === 'banner') {
    const set = (patch: Partial<typeof block>) => onChange({ ...block, ...patch });
    return (
      <div className="hd-fields">
        <label className="auth-label">Heading</label>
        <input className="auth-input" maxLength={120} value={block.title} onChange={(e) => set({ title: e.target.value })} />
        <label className="auth-label">Text</label>
        <textarea
          className="auth-input"
          rows={3}
          maxLength={600}
          value={block.text}
          onChange={(e) => set({ text: e.target.value })}
        />
        <ImageDrop
          value={block.imageUrl === '#' ? '' : block.imageUrl}
          onChange={(url) => set({ imageUrl: url })}
          label="Picture (optional)"
        />
        <label className="auth-label">Button text (leave empty for no button)</label>
        <input
          className="auth-input"
          maxLength={60}
          value={block.ctaText}
          onChange={(e) => set({ ctaText: e.target.value })}
          style={{ maxWidth: 320 }}
        />
        {block.ctaText.trim() !== '' && (
          <LinkField value={block.ctaHref} onChange={(v) => set({ ctaHref: v })} categories={categories} />
        )}
      </div>
    );
  }

  const setCards = (cards: HomeBlockCard[]) => onChange({ ...block, cards });
  const updateCard = (i: number, patch: Partial<HomeBlockCard>) =>
    setCards(block.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="hd-fields">
      <label className="auth-label">Heading (optional)</label>
      <input
        className="auth-input"
        maxLength={120}
        value={block.title}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        style={{ maxWidth: 420 }}
      />
      {block.cards.length === 0 && <p className="prod-form__hint">No cards yet. Add the first one.</p>}
      {block.cards.map((c, i) => (
        <div className="ce-promo" key={i}>
          <div className="prod-grid">
            <div>
              <label className="auth-label">Icon (an emoji)</label>
              <input className="auth-input" maxLength={8} value={c.icon} onChange={(e) => updateCard(i, { icon: e.target.value })} />
            </div>
            <div>
              <label className="auth-label">Title</label>
              <input className="auth-input" maxLength={80} value={c.title} onChange={(e) => updateCard(i, { title: e.target.value })} />
            </div>
            <div>
              <label className="auth-label">Small text</label>
              <input className="auth-input" maxLength={160} value={c.subtitle} onChange={(e) => updateCard(i, { subtitle: e.target.value })} />
            </div>
          </div>
          <LinkField value={c.href} onChange={(v) => updateCard(i, { href: v })} categories={categories} />
          <button type="button" className="wiz__vdel" aria-label="Remove card" onClick={() => setCards(block.cards.filter((_, j) => j !== i))}>
            ✕ Remove card
          </button>
        </div>
      ))}
      <button
        type="button"
        className="wiz__addvar"
        disabled={block.cards.length >= LIMITS.cards}
        onClick={() => setCards([...block.cards, { icon: '', title: 'New card', subtitle: '', href: '#' }])}
      >
        + Add card {block.cards.length >= LIMITS.cards ? `(max ${LIMITS.cards})` : ''}
      </button>
    </div>
  );
}

// ───────────────────────── promo tiles / why choose us ─────────────────────────

export function PromosEditor({
  promos,
  onChange,
  categories,
}: {
  promos: PromoContent[];
  onChange: (next: PromoContent[]) => void;
  categories: LinkCategory[];
}) {
  const update = (i: number, patch: Partial<PromoContent>) =>
    onChange(promos.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="hd-fields">
      <p className="prod-form__hint">
        Each tile is either a <strong>picture</strong> (upload a banner image and it fills the whole tile) or a{' '}
        <strong>coloured text tile</strong> (title, small text and a button). Pictures look best at{' '}
        <strong>{PROMO_IMAGE_SIZE}</strong>.
      </p>
      {promos.map((p, i) => {
        const image = promoImage(p);
        return (
          <div className="ce-promo" key={i} data-testid={`promo-editor-${i}`}>
            <ImageDrop
              value={image ?? ''}
              onChange={(url) => update(i, { imageUrl: url })}
              label={`Tile picture (${PROMO_IMAGE_SIZE})`}
              previewHeight={110}
            />
            {image && (
              <>
                <span className="prod-form__hint">
                  The picture fills the tile. The title below is only its description for screen readers and search
                  engines, so it is not shown on top of the picture.
                </span>
                <button type="button" className="wiz__vdel" onClick={() => update(i, { imageUrl: '' })}>
                  Remove picture (use a text tile instead)
                </button>
              </>
            )}
            <div className="prod-grid">
              <div>
                <label className="auth-label">{image ? 'Description of the picture' : 'Title'}</label>
                <input className="auth-input" maxLength={120} value={p.title} onChange={(e) => update(i, { title: e.target.value })} />
              </div>
              {!image && (
                <>
                  <div>
                    <label className="auth-label">Small text</label>
                    <input className="auth-input" maxLength={160} value={p.subtitle} onChange={(e) => update(i, { subtitle: e.target.value })} />
                  </div>
                  <div>
                    <label className="auth-label">Button text</label>
                    <input className="auth-input" maxLength={60} value={p.cta} onChange={(e) => update(i, { cta: e.target.value })} />
                  </div>
                  <div>
                    <label className="auth-label">Colour</label>
                    <select className="auth-input" value={p.color} onChange={(e) => update(i, { color: e.target.value as PromoContent['color'] })}>
                      {PROMO_COLORS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <LinkField value={p.href} onChange={(v) => update(i, { href: v })} categories={categories} />
            <button
              type="button"
              className="wiz__vdel"
              disabled={promos.length <= 1}
              aria-label="Remove tile"
              onClick={() => onChange(promos.filter((_, j) => j !== i))}
            >
              ✕ Remove tile
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="wiz__addvar"
        disabled={promos.length >= LIMITS.promos}
        onClick={() =>
          onChange([
            ...promos,
            { title: 'New tile', subtitle: '', cta: 'Shop Now', href: '/search', icon: '', color: 'green', imageUrl: '' },
          ])
        }
      >
        + Add tile {promos.length >= LIMITS.promos ? `(max ${LIMITS.promos})` : ''}
      </button>
      <span className="prod-form__hint">Keep at least one tile; to hide them all, switch the section off.</span>
    </div>
  );
}

export function WhyEditor({ items, onChange }: { items: WhyItem[]; onChange: (next: WhyItem[]) => void }) {
  const update = (i: number, patch: Partial<WhyItem>) =>
    onChange(items.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <div className="hd-fields">
      {items.map((w, i) => (
        <div className="ce-promo" key={i}>
          <div className="prod-grid">
            <div>
              <label className="auth-label">Icon (an emoji)</label>
              <input className="auth-input" maxLength={8} value={w.icon} onChange={(e) => update(i, { icon: e.target.value })} />
            </div>
            <div>
              <label className="auth-label">Title</label>
              <input className="auth-input" maxLength={80} value={w.title} onChange={(e) => update(i, { title: e.target.value })} />
            </div>
            <div>
              <label className="auth-label">Small text</label>
              <input className="auth-input" maxLength={120} value={w.sub} onChange={(e) => update(i, { sub: e.target.value })} />
            </div>
          </div>
          <button
            type="button"
            className="wiz__vdel"
            disabled={items.length <= 1}
            aria-label="Remove point"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            ✕ Remove point
          </button>
        </div>
      ))}
      <button
        type="button"
        className="wiz__addvar"
        disabled={items.length >= LIMITS.why}
        onClick={() => onChange([...items, { icon: '⭐', title: 'New point', sub: '' }])}
      >
        + Add point {items.length >= LIMITS.why ? `(max ${LIMITS.why})` : ''}
      </button>
      <span className="prod-form__hint">Keep at least one point; to hide them all, switch the section off.</span>
    </div>
  );
}

// ───────────────────────── sections whose content lives elsewhere ─────────────────────────

export function InfoNote({ kind }: { kind: 'hero' | 'categories' | 'brands' }) {
  const text: Record<typeof kind, { body: string; href: string; link: string }> = {
    hero: {
      body: 'The big slider at the top shows the banners you upload under Marketing (home hero). With none uploaded it shows the welcome banner.',
      href: '/admin/marketing',
      link: 'Manage the banners →',
    },
    categories: {
      body: 'Shows your categories as circles. Their names, pictures and order come from Categories.',
      href: '/admin/categories',
      link: 'Manage categories →',
    },
    brands: {
      body: 'Shows your brands. Add or edit brands under Brands.',
      href: '/admin/brands',
      link: 'Manage brands →',
    },
  };
  const t = text[kind];
  return (
    <div className="hd-fields">
      <p className="prod-form__hint">{t.body}</p>
      <Link href={t.href} className="mh-link-btn">
        {t.link}
      </Link>
    </div>
  );
}
