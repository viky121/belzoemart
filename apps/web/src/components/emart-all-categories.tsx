'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { CategoryNodeDto } from '@belzo/shared';
import { iconFor, isUsableImageUrl } from '@/lib/category-theme';

/**
 * "All Categories" mega-menu. Opens a 3-column flyout: primary categories on
 * the left; hovering a primary reveals its sub-categories in the middle column;
 * hovering a sub reveals its final-detail categories on the right. Every item
 * is also a link to that category page.
 */
export function EmartAllCategories({ categories }: { categories: CategoryNodeDto[] }) {
  const [open, setOpen] = useState(false);
  const [activeP, setActiveP] = useState('');
  const [activeS, setActiveS] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function openMenu() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    if (!activeP && categories[0]) {
      setActiveP(categories[0].id);
      setActiveS(categories[0].children?.[0]?.id ?? '');
    }
  }
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }
  function selectPrimary(c: CategoryNodeDto) {
    setActiveP(c.id);
    setActiveS(c.children?.[0]?.id ?? '');
  }

  const primary = categories.find((c) => c.id === activeP) ?? categories[0];
  const subs = primary?.children ?? [];
  const sub = subs.find((s) => s.id === activeS) ?? subs[0];
  const finals = sub?.children ?? [];

  return (
    <div className="em-allcat-wrap" ref={ref} onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button
        type="button"
        className={`em-allcat${open ? ' em-allcat--open' : ''}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-expanded={open}
        aria-haspopup="true"
        data-testid="emart-all-categories"
      >
        ☰ All Categories <span className="em-allcat__chev">▾</span>
      </button>

      {open && (
        <div className="em-mega" role="menu" data-testid="emart-all-categories-menu">
          {categories.length === 0 ? (
            <span className="em-allcat__empty">No categories</span>
          ) : (
            <>
              {/* Column 1 — primary categories */}
              <div className="em-mega__col em-mega__col--primary">
                {categories.map((c) => {
                  const hasKids = (c.children?.length ?? 0) > 0;
                  return (
                    <Link
                      key={c.id}
                      href={`/category/${c.slug}`}
                      className={`em-mega__item${primary?.id === c.id ? ' is-active' : ''}`}
                      role="menuitem"
                      onMouseEnter={() => selectPrimary(c)}
                      onFocus={() => selectPrimary(c)}
                      onClick={() => setOpen(false)}
                    >
                      <span className={`em-mega__ic${isUsableImageUrl(c.imageUrl) ? ' em-mega__ic--img' : ''}`}>
                        {isUsableImageUrl(c.imageUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.imageUrl} alt="" />
                        ) : (
                          iconFor(c.slug)
                        )}
                      </span>
                      <span className="em-mega__label">{c.name}</span>
                      {hasKids && <span className="em-mega__arrow">›</span>}
                    </Link>
                  );
                })}
              </div>

              {/* Column 2 — sub-categories of the active primary */}
              <div className="em-mega__col em-mega__col--sub">
                {subs.length === 0 ? (
                  <p className="em-mega__empty">No sub-categories</p>
                ) : (
                  subs.map((s) => {
                    const hasKids = (s.children?.length ?? 0) > 0;
                    return (
                      <Link
                        key={s.id}
                        href={`/category/${s.slug}`}
                        className={`em-mega__item${sub?.id === s.id ? ' is-active' : ''}`}
                        role="menuitem"
                        onMouseEnter={() => setActiveS(s.id)}
                        onFocus={() => setActiveS(s.id)}
                        onClick={() => setOpen(false)}
                      >
                        <span className="em-mega__label">{s.name}</span>
                        {hasKids && <span className="em-mega__arrow">›</span>}
                      </Link>
                    );
                  })
                )}
              </div>

              {/* Column 3 — final-detail categories of the active sub */}
              <div className="em-mega__col em-mega__col--final">
                {finals.length === 0 ? (
                  <p className="em-mega__empty">{sub ? 'No further categories' : 'Select a sub-category'}</p>
                ) : (
                  finals.map((f) => (
                    <Link
                      key={f.id}
                      href={`/category/${f.slug}`}
                      className="em-mega__item"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                    >
                      <span className="em-mega__label">{f.name}</span>
                    </Link>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
