'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MOBILE_HOME,
  MOBILE_LIMITS,
  mobileHomeSchema,
  type CategoryNodeDto,
  type MobileBanner,
  type MobileHome,
} from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';
import { safeUuid } from '@/lib/uuid';
import { BannerList } from './banner-list';
import { CategoriesPanel, fullCategoryList } from './categories-panel';
import type { LinkCategory } from './link-field';
import { FestivalPanel } from './festival-panel';
import { OfferRowsPanel } from './offer-rows-panel';

type Tab = 'festival' | 'hero' | 'categories' | 'offers' | 'deals';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'festival', label: 'Festival theme', icon: '🪔' },
  { id: 'hero', label: 'Main banners', icon: '🖼️' },
  { id: 'categories', label: 'Categories', icon: '🗂️' },
  { id: 'offers', label: 'Offer rows', icon: '🏷️' },
  { id: 'deals', label: 'Deals', icon: '🔥' },
];

function flattenForLinks(nodes: CategoryNodeDto[], depth = 0): LinkCategory[] {
  return nodes.flatMap((n) => [
    { slug: n.slug, label: `${'— '.repeat(depth)}${n.name}` },
    ...flattenForLinks(n.children ?? [], depth + 1),
  ]);
}

interface LegacyBanner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
}

/** Admin "Mobile" module: everything the app home shows, in one editable config. */
export default function AdminMobilePage() {
  const [cfg, setCfg] = useState<MobileHome | null>(null);
  const [saved, setSaved] = useState('');
  const [tree, setTree] = useState<CategoryNodeDto[]>([]);
  const [tab, setTab] = useState<Tab>('festival');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [home, cats] = await Promise.all([
          adminFetch<MobileHome>('/admin/mobile-home'),
          adminFetch<CategoryNodeDto[]>('/categories').catch(() => [] as CategoryNodeDto[]),
        ]);
        if (cancelled) return;
        // Show every category as an editable row; the snapshot includes this so the page starts "clean".
        const normalized: MobileHome = { ...home, categories: fullCategoryList(cats, home.categories) };
        setTree(cats);
        setCfg(normalized);
        setSaved(JSON.stringify(normalized));
      } catch {
        if (!cancelled) setLoadError('Could not load the Mobile settings. You may not have access (Marketing role required).');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = cfg !== null && JSON.stringify(cfg) !== saved;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const linkCategories = useMemo(() => flattenForLinks(tree), [tree]);
  const patch = useCallback((p: Partial<MobileHome>) => setCfg((c) => (c ? { ...c, ...p } : c)), []);

  async function importLegacy() {
    try {
      const rows = await adminFetch<LegacyBanner[]>('/banners?placement=home_hero');
      if (rows.length === 0) {
        setMsg({ text: 'No banners found under Marketing.', ok: false });
        return;
      }
      const imported: MobileBanner[] = rows.map((b) => ({
        id: safeUuid(),
        imageUrl: b.imageUrl,
        linkUrl: b.linkUrl ?? '#',
        title: b.title ?? '',
        enabled: true,
      }));
      setCfg((c) =>
        c ? { ...c, heroBanners: [...c.heroBanners, ...imported].slice(0, MOBILE_LIMITS.heroBanners) } : c,
      );
      setMsg({ text: `Imported ${imported.length} banner(s). Review and press Save.`, ok: true });
    } catch {
      setMsg({ text: 'Could not read the Marketing banners.', ok: false });
    }
  }

  async function save() {
    if (!cfg) return;
    setMsg(null);
    const parsed = mobileHomeSchema.safeParse(cfg);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      const where = i ? i.path.join(' › ') : '';
      setMsg({ text: `Cannot save: ${i?.message ?? 'invalid data'}${where ? ` (${where})` : ''}.`, ok: false });
      return;
    }
    setBusy(true);
    try {
      const out = await adminFetch<MobileHome>('/admin/mobile-home', { method: 'PUT', body: parsed.data });
      const normalized: MobileHome = { ...out, categories: fullCategoryList(tree, out.categories) };
      setCfg(normalized);
      setSaved(JSON.stringify(normalized));
      setMsg({ text: 'Saved. The app picks this up within a couple of minutes (or on pull-to-refresh).', ok: true });
    } catch {
      setMsg({ text: 'Could not save. Check your connection and try again.', ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="admin-page">
        <h1>📱 Mobile app</h1>
        <p role="alert" className="prod-form__msg">
          {loadError}
        </p>
      </div>
    );
  }
  if (!cfg) {
    return (
      <div className="admin-page">
        <h1>📱 Mobile app</h1>
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page mh-page" data-testid="admin-mobile">
      <div className="mh-head">
        <div>
          <h1>📱 Mobile app</h1>
          <p className="prod-form__hint">Control what customers see on the app home screen. Changes go live when you press Save.</p>
        </div>
        <div className="mh-save">
          {dirty && <span className="mh-dirty">Unsaved changes</span>}
          <button className="auth-btn" disabled={busy || !dirty} onClick={save} data-testid="mh-save">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {msg && (
        <p role="status" className={`mh-msg${msg.ok ? ' mh-msg--ok' : ' mh-msg--bad'}`}>
          {msg.text}
        </p>
      )}

      <div className="mh-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`mh-tab${tab === t.id ? ' mh-tab--on' : ''}`}
            onClick={() => setTab(t.id)}
            data-testid={`mh-tab-${t.id}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <section className="ce-card">
        {tab === 'festival' && (
          <>
            <h2>🪔 Festival theme</h2>
            <FestivalPanel
              value={{
                festival: cfg.festival,
                festivalGreeting: cfg.festivalGreeting,
                festivalDecor: cfg.festivalDecor,
              }}
              onChange={patch}
            />
          </>
        )}

        {tab === 'hero' && (
          <>
            <h2>🖼️ Main banners (top slider)</h2>
            <p className="prod-form__hint">
              Swipeable banners at the top of the home screen (recommended 1000 × 400 px). If you add none here, the app
              keeps showing the banners from Marketing.
            </p>
            <div style={{ marginBottom: 10 }}>
              <button type="button" className="mh-link-btn" onClick={importLegacy}>
                ⬇ Import current Marketing banners
              </button>
            </div>
            <BannerList
              banners={cfg.heroBanners}
              onChange={(heroBanners) => patch({ heroBanners })}
              max={MOBILE_LIMITS.heroBanners}
              categories={linkCategories}
              sizeHint="1000 × 400 px"
            />
          </>
        )}

        {tab === 'categories' && (
          <>
            <h2>🗂️ Categories &amp; icons</h2>
            <CategoriesPanel tree={tree} value={cfg.categories} onChange={(categories) => patch({ categories })} />
          </>
        )}

        {tab === 'offers' && (
          <>
            <h2>🏷️ Offer banner rows</h2>
            <OfferRowsPanel rows={cfg.offerRows} onChange={(offerRows) => patch({ offerRows })} categories={linkCategories} />
          </>
        )}

        {tab === 'deals' && (
          <>
            <h2>🔥 Deals section</h2>
            <p className="prod-form__hint">The product grid on the home screen showing the biggest discounts.</p>
            <label className="mh-check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={cfg.dealsEnabled} onChange={(e) => patch({ dealsEnabled: e.target.checked })} />
              Show the deals section
            </label>
            <label className="auth-label">Section title</label>
            <input
              className="auth-input"
              maxLength={60}
              value={cfg.dealsTitle}
              onChange={(e) => patch({ dealsTitle: e.target.value })}
              placeholder={DEFAULT_MOBILE_HOME.dealsTitle}
              style={{ maxWidth: 360 }}
            />
          </>
        )}
      </section>
    </div>
  );
}
