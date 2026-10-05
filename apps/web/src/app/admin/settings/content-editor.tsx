'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { PROMO_COLORS, homeContentSchema, type HomeBlock } from '@belzo/shared';
import {
  DEFAULT_FOOTER,
  DEFAULT_HOME_EMART,
  DEFAULT_HOME_CLASSIC,
  mergeHome,
  type FooterContent,
  type HomeContent,
  type PromoContent,
  type ThemeName,
  type WhyItem,
} from '@/lib/site-content';
import { ImageDrop } from './image-drop';

/** Swap two array elements, returning a new array (no-op if j is out of range). */
function swap<T>(list: T[], i: number, j: number): T[] {
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * Admin editor for the theme-scoped home-page content + the shared footer.
 * A theme selector chooses which theme's home content is being edited (eMart
 * stored under `home_content`, classic under `home_content.classic`); both are
 * loaded up front and swapped in memory, saved to the matching key.
 */
export function ContentEditor() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>('emart');
  const [homes, setHomes] = useState<Record<ThemeName, HomeContent>>({
    emart: DEFAULT_HOME_EMART,
    classic: DEFAULT_HOME_CLASSIC,
  });
  const [footer, setFooter] = useState<FooterContent>(DEFAULT_FOOTER);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const home = homes[selectedTheme];

  useEffect(() => {
    void adminFetch<Record<string, unknown>>('/admin/settings')
      .then((s) => {
        const e = s['home_content'] as Partial<HomeContent> | undefined;
        const c = s['home_content.classic'] as Partial<HomeContent> | undefined;
        const f = s['footer_content'] as Partial<FooterContent> | undefined;
        setHomes({
          emart: mergeHome('emart', e),
          classic: mergeHome('classic', c),
        });
        if (f) setFooter({ ...DEFAULT_FOOTER, ...f });
      })
      .catch(() => undefined);
  }, []);

  const setHome = (updater: (h: HomeContent) => HomeContent) =>
    setHomes((hs) => ({ ...hs, [selectedTheme]: updater(hs[selectedTheme]) }));

  async function save(key: string, value: unknown, label: string) {
    setBusy(true);
    setMsg(null);
    try {
      await adminFetch('/admin/settings', { method: 'PUT', body: { key, value } });
      setMsg(`${label} saved. Live on the storefront.`);
    } catch {
      setMsg(`Could not save ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  function saveHome() {
    const parsed = homeContentSchema.safeParse(home);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setMsg(`Cannot save: ${first ? `${first.path.join('.')} — ${first.message}` : 'invalid home content'}.`);
      return;
    }
    const key = selectedTheme === 'emart' ? 'home_content' : 'home_content.classic';
    void save(key, parsed.data, 'Home content');
  }

  // ---- Hero / promos / why ------------------------------------------------
  const setHero = (patch: Partial<HomeContent['hero']>) =>
    setHome((h) => ({ ...h, hero: { ...h.hero, ...patch } }));
  const setPromo = (i: number, patch: Partial<PromoContent>) =>
    setHome((h) => ({ ...h, promos: h.promos.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addPromo = () =>
    setHome((h) => ({
      ...h,
      promos: [...h.promos, { title: '', subtitle: '', cta: 'Shop Now', href: '/search', icon: '🛒', color: 'green' }],
    }));
  const removePromo = (i: number) =>
    setHome((h) => ({ ...h, promos: h.promos.filter((_, j) => j !== i) }));
  const swapPromo = (i: number, j: number) =>
    setHome((h) => ({ ...h, promos: swap(h.promos, i, j) }));

  const setWhy = (i: number, patch: Partial<WhyItem>) =>
    setHome((h) => ({ ...h, why: h.why.map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
  const swapWhy = (i: number, j: number) => setHome((h) => ({ ...h, why: swap(h.why, i, j) }));

  // ---- Custom blocks ------------------------------------------------------
  const addBlock = (type: HomeBlock['type']) =>
    setHome((h) => {
      const block: HomeBlock =
        type === 'banner'
          ? { type: 'banner', id: crypto.randomUUID(), title: '', text: '', imageUrl: '', ctaText: '', ctaHref: '#', enabled: true }
          : { type: 'cards', id: crypto.randomUUID(), title: '', cards: [], enabled: true };
      return { ...h, blocks: [...h.blocks, block] };
    });
  const setBlock = (i: number, patch: Partial<HomeBlock>) =>
    setHome((h) => ({
      ...h,
      blocks: h.blocks.map((b, j) => (j === i ? ({ ...b, ...patch } as HomeBlock) : b)),
    }));
  const removeBlock = (i: number) => setHome((h) => ({ ...h, blocks: h.blocks.filter((_, j) => j !== i) }));
  const swapBlock = (i: number, j: number) => setHome((h) => ({ ...h, blocks: swap(h.blocks, i, j) }));

  const addCard = (bi: number) =>
    setHome((h) => ({
      ...h,
      blocks: h.blocks.map((b, j) =>
        j === bi && b.type === 'cards'
          ? { ...b, cards: [...b.cards, { icon: '', title: '', subtitle: '', href: '#' }] }
          : b,
      ),
    }));
  const setCard = (bi: number, ci: number, patch: Partial<{ icon: string; title: string; subtitle: string; href: string }>) =>
    setHome((h) => ({
      ...h,
      blocks: h.blocks.map((b, j) =>
        j === bi && b.type === 'cards'
          ? { ...b, cards: b.cards.map((c, k) => (k === ci ? { ...c, ...patch } : c)) }
          : b,
      ),
    }));
  const removeCard = (bi: number, ci: number) =>
    setHome((h) => ({
      ...h,
      blocks: h.blocks.map((b, j) =>
        j === bi && b.type === 'cards' ? { ...b, cards: b.cards.filter((_, k) => k !== ci) } : b,
      ),
    }));
  const swapCard = (bi: number, ci: number, cj: number) =>
    setHome((h) => ({
      ...h,
      blocks: h.blocks.map((b, j) =>
        j === bi && b.type === 'cards' ? { ...b, cards: swap(b.cards, ci, cj) } : b,
      ),
    }));

  const isClassic = selectedTheme === 'classic';

  return (
    <div className="content-editor">
      {msg && <p role="status" className="prod-form__msg">{msg}</p>}

      {/* HOME */}
      <section className="ce-card">
        <h2>🏠 Home page content</h2>

        {/* Theme selector */}
        <div className="ce-theme-tabs" role="tablist" aria-label="Theme to edit">
          <button
            type="button"
            className={`ce-theme-tab${selectedTheme === 'classic' ? ' ce-theme-tab--active' : ''}`}
            onClick={() => setSelectedTheme('classic')}
            data-testid="theme-tab-classic"
          >
            Classic
          </button>
          <button
            type="button"
            className={`ce-theme-tab${selectedTheme === 'emart' ? ' ce-theme-tab--active' : ''}`}
            onClick={() => setSelectedTheme('emart')}
            data-testid="theme-tab-emart"
          >
            eMart
          </button>
        </div>
        <p className="prod-form__hint">
          Editing the <strong>{isClassic ? 'Classic' : 'eMart'}</strong> theme’s home content. This is
          independent of which theme is currently live.
        </p>

        {/* Hero — eMart only */}
        {isClassic ? (
          <p className="prod-form__hint">The hero section is used by the eMart theme only.</p>
        ) : (
          <>
            <h3 className="prod-subhead">Hero</h3>
            <div className="prod-grid">
              <div className="prod-grid__full">
                <label className="auth-label">Eyebrow</label>
                <input className="auth-input" value={home.hero.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Title line 1</label>
                <input className="auth-input" value={home.hero.line1} onChange={(e) => setHero({ line1: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Title line 2</label>
                <input className="auth-input" value={home.hero.line2} onChange={(e) => setHero({ line2: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Accent word (green)</label>
                <input className="auth-input" value={home.hero.accent} onChange={(e) => setHero({ accent: e.target.value })} />
              </div>
              <div className="prod-grid__full">
                <label className="auth-label">Subtitle</label>
                <input className="auth-input" value={home.hero.subtitle} onChange={(e) => setHero({ subtitle: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Button text</label>
                <input className="auth-input" value={home.hero.ctaText} onChange={(e) => setHero({ ctaText: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Button link</label>
                <input className="auth-input" value={home.hero.ctaHref} onChange={(e) => setHero({ ctaHref: e.target.value })} />
              </div>
              <div className="prod-grid__full">
                <ImageDrop label="Hero image" value={home.hero.imageUrl} onChange={(url) => setHero({ imageUrl: url })} />
                <input
                  className="auth-input"
                  style={{ marginTop: 6 }}
                  value={home.hero.imageUrl}
                  onChange={(e) => setHero({ imageUrl: e.target.value })}
                  placeholder="…or paste an image URL"
                />
              </div>
            </div>
          </>
        )}

        <h3 className="prod-subhead">Promo banners</h3>
        {home.promos.map((p, i) => (
          <div className="ce-promo" key={i}>
            <div className="prod-grid">
              <div>
                <label className="auth-label">Title</label>
                <input className="auth-input" value={p.title} onChange={(e) => setPromo(i, { title: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Subtitle</label>
                <input className="auth-input" value={p.subtitle} onChange={(e) => setPromo(i, { subtitle: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">CTA text</label>
                <input className="auth-input" value={p.cta} onChange={(e) => setPromo(i, { cta: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Link</label>
                <input className="auth-input" value={p.href} onChange={(e) => setPromo(i, { href: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Icon (emoji)</label>
                <input className="auth-input" value={p.icon} onChange={(e) => setPromo(i, { icon: e.target.value })} />
              </div>
              <div>
                <label className="auth-label">Colour</label>
                <select className="auth-input" value={p.color} onChange={(e) => setPromo(i, { color: e.target.value as PromoContent['color'] })}>
                  {PROMO_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="ce-why" style={{ marginTop: 8 }}>
              <span style={{ flex: 1 }} />
              <button type="button" className="wiz__vdel" onClick={() => swapPromo(i, i - 1)} disabled={i === 0} aria-label="Move promo up">↑</button>
              <button type="button" className="wiz__vdel" onClick={() => swapPromo(i, i + 1)} disabled={i === home.promos.length - 1} aria-label="Move promo down">↓</button>
              <button type="button" className="wiz__vdel" onClick={() => removePromo(i)} aria-label="Delete promo">✕</button>
            </div>
          </div>
        ))}
        <button type="button" className="wiz__addvar" onClick={addPromo}>
          + Add promo
        </button>

        {/* Why Choose — eMart only */}
        {isClassic ? (
          <p className="prod-form__hint" style={{ marginTop: 14 }}>
            The “Why Choose” section is used by the eMart theme only. Use an Extra block (cards) for a
            similar strip on classic.
          </p>
        ) : (
          <>
            <h3 className="prod-subhead">“Why Choose” items</h3>
            {home.why.map((w, i) => (
              <div className="ce-why" key={i}>
                <input className="auth-input" style={{ width: 64 }} value={w.icon} onChange={(e) => setWhy(i, { icon: e.target.value })} placeholder="🚚" />
                <input className="auth-input" value={w.title} onChange={(e) => setWhy(i, { title: e.target.value })} placeholder="Title" />
                <input className="auth-input" value={w.sub} onChange={(e) => setWhy(i, { sub: e.target.value })} placeholder="Subtitle" />
                <button type="button" className="wiz__vdel" onClick={() => swapWhy(i, i - 1)} disabled={i === 0} aria-label="Move item up">↑</button>
                <button type="button" className="wiz__vdel" onClick={() => swapWhy(i, i + 1)} disabled={i === home.why.length - 1} aria-label="Move item down">↓</button>
                <button type="button" className="wiz__vdel" onClick={() => setHome((h) => ({ ...h, why: h.why.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <button type="button" className="wiz__addvar" onClick={() => setHome((h) => ({ ...h, why: [...h.why, { icon: '⭐', title: '', sub: '' }] }))}>
              + Add item
            </button>
          </>
        )}

        {/* Extra blocks */}
        <h3 className="prod-subhead">Extra blocks</h3>
        <p className="prod-form__hint">Custom banners and info-card grids, shown on this theme’s home page.</p>
        {home.blocks.map((b, i) => (
          <div className="ce-promo" key={i}>
            <div className="ce-why" style={{ marginBottom: 8 }}>
              <strong style={{ flex: 1 }}>{b.type === 'banner' ? 'Banner' : 'Cards'} block</strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={b.enabled} onChange={(e) => setBlock(i, { enabled: e.target.checked })} />
                Enabled
              </label>
              <button type="button" className="wiz__vdel" onClick={() => swapBlock(i, i - 1)} disabled={i === 0} aria-label="Move block up">↑</button>
              <button type="button" className="wiz__vdel" onClick={() => swapBlock(i, i + 1)} disabled={i === home.blocks.length - 1} aria-label="Move block down">↓</button>
              <button type="button" className="wiz__vdel" onClick={() => removeBlock(i)} aria-label="Delete block">✕</button>
            </div>
            <div className="prod-grid">
              <div className="prod-grid__full">
                <label className="auth-label">Heading</label>
                <input className="auth-input" value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} />
              </div>
            </div>
            {b.type === 'banner' ? (
              <div className="prod-grid">
                <div className="prod-grid__full">
                  <label className="auth-label">Text</label>
                  <textarea className="auth-input prod-textarea" rows={2} value={b.text} onChange={(e) => setBlock(i, { text: e.target.value })} />
                </div>
                <div>
                  <label className="auth-label">CTA text</label>
                  <input className="auth-input" value={b.ctaText} onChange={(e) => setBlock(i, { ctaText: e.target.value })} />
                </div>
                <div>
                  <label className="auth-label">CTA link</label>
                  <input className="auth-input" value={b.ctaHref} onChange={(e) => setBlock(i, { ctaHref: e.target.value })} />
                </div>
                <div className="prod-grid__full">
                  <ImageDrop label="Banner image" value={b.imageUrl} onChange={(url) => setBlock(i, { imageUrl: url })} />
                  <input
                    className="auth-input"
                    style={{ marginTop: 6 }}
                    value={b.imageUrl}
                    onChange={(e) => setBlock(i, { imageUrl: e.target.value })}
                    placeholder="…or paste an image URL"
                  />
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                <label className="auth-label">Cards</label>
                {b.cards.map((c, ci) => (
                  <div className="ce-why" key={ci}>
                    <input className="auth-input" style={{ width: 64 }} value={c.icon} onChange={(e) => setCard(i, ci, { icon: e.target.value })} placeholder="⭐" />
                    <input className="auth-input" value={c.title} onChange={(e) => setCard(i, ci, { title: e.target.value })} placeholder="Title" />
                    <input className="auth-input" value={c.subtitle} onChange={(e) => setCard(i, ci, { subtitle: e.target.value })} placeholder="Subtitle" />
                    <input className="auth-input" value={c.href} onChange={(e) => setCard(i, ci, { href: e.target.value })} placeholder="Link" />
                    <button type="button" className="wiz__vdel" onClick={() => swapCard(i, ci, ci - 1)} disabled={ci === 0} aria-label="Move card up">↑</button>
                    <button type="button" className="wiz__vdel" onClick={() => swapCard(i, ci, ci + 1)} disabled={ci === b.cards.length - 1} aria-label="Move card down">↓</button>
                    <button type="button" className="wiz__vdel" onClick={() => removeCard(i, ci)} aria-label="Delete card">✕</button>
                  </div>
                ))}
                <button type="button" className="wiz__addvar" onClick={() => addCard(i)}>
                  + Add card
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="ce-why" style={{ marginTop: 8 }}>
          <button type="button" className="wiz__addvar" onClick={() => addBlock('banner')}>+ Add banner block</button>
          <button type="button" className="wiz__addvar" onClick={() => addBlock('cards')}>+ Add cards block</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <button className="auth-btn" disabled={busy} onClick={saveHome} data-testid="save-home-content">
            {busy ? 'Saving…' : `Save ${isClassic ? 'Classic' : 'eMart'} Home Content`}
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <section className="ce-card">
        <h2>📄 Footer</h2>
        <div className="prod-grid">
          <div className="prod-grid__full">
            <label className="auth-label">Description</label>
            <textarea className="auth-input prod-textarea" rows={2} value={footer.description} onChange={(e) => setFooter({ ...footer, description: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Support phone</label>
            <input className="auth-input" value={footer.phone} onChange={(e) => setFooter({ ...footer, phone: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Support email</label>
            <input className="auth-input" value={footer.email} onChange={(e) => setFooter({ ...footer, email: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Support hours</label>
            <input className="auth-input" value={footer.hours} onChange={(e) => setFooter({ ...footer, hours: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Newsletter heading</label>
            <input className="auth-input" value={footer.newsletter} onChange={(e) => setFooter({ ...footer, newsletter: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Facebook URL</label>
            <input className="auth-input" value={footer.facebook} onChange={(e) => setFooter({ ...footer, facebook: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Instagram URL</label>
            <input className="auth-input" value={footer.instagram} onChange={(e) => setFooter({ ...footer, instagram: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">YouTube URL</label>
            <input className="auth-input" value={footer.youtube} onChange={(e) => setFooter({ ...footer, youtube: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">LinkedIn URL</label>
            <input className="auth-input" value={footer.linkedin} onChange={(e) => setFooter({ ...footer, linkedin: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Copyright name</label>
            <input className="auth-input" value={footer.copyright} onChange={(e) => setFooter({ ...footer, copyright: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="auth-btn" disabled={busy} onClick={() => save('footer_content', footer, 'Footer content')} data-testid="save-footer-content">
            {busy ? 'Saving…' : 'Save Footer Content'}
          </button>
        </div>
      </section>
    </div>
  );
}
