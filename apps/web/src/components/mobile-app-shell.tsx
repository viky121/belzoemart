'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cartApi } from '@/lib/cart-api';
import { isPhoneLayout } from '@/lib/fly-to-cart';
import { activeTab, badgeText, cartPillHidden, itemsLabel, tabBarHidden, TABS, type TabId } from '@/lib/mobile-shell';

const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Line icons for the bottom bar (the same five places as the app). */
function TabIcon({ id }: { id: TabId }) {
  switch (id) {
    case 'home':
      return (
        <svg {...ICON_PROPS}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10.5V20h13v-9.5" />
          <path d="M10 20v-5.5h4V20" />
        </svg>
      );
    case 'categories':
      return (
        <svg {...ICON_PROPS}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
        </svg>
      );
    case 'offers':
      return (
        <svg {...ICON_PROPS}>
          <path d="M3.5 12.2V4.5h7.7l9 9a1.8 1.8 0 0 1 0 2.5l-5.2 5.2a1.8 1.8 0 0 1-2.5 0z" />
          <circle cx="8" cy="9" r="1.3" />
        </svg>
      );
    case 'cart':
      return (
        <svg {...ICON_PROPS}>
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
          <path d="M2.5 3.5H5l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1" />
        </svg>
      );
    default:
      return (
        <svg {...ICON_PROPS}>
          <circle cx="12" cy="8.5" r="3.7" />
          <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
  }
}

/**
 * The phone layout's bottom bar (Home / Categories / Offers / Cart / Account) and the floating
 * "View cart, N items" pill. Both are hidden by CSS on a computer; the cart count is read from the
 * `belzo:cart` events the cart API already sends. Adding to the cart bumps the Cart tab
 * (`belzo:cart-bump`) after the picture has flown into it.
 */
export function MobileAppShell() {
  const pathname = usePathname() ?? '/';
  const { accessToken } = useAuth();
  const [count, setCount] = useState(0);
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    const onCart = (e: Event) => {
      const d = (e as CustomEvent<{ count: number; thumbs?: (string | null)[] }>).detail;
      if (d && typeof d.count === 'number') {
        setCount(d.count);
        setThumbs(Array.isArray(d.thumbs) ? d.thumbs : []);
      }
    };
    let timer: ReturnType<typeof setTimeout>;
    const onBump = () => {
      setBump(true);
      clearTimeout(timer);
      timer = setTimeout(() => setBump(false), 650);
    };
    window.addEventListener('belzo:cart', onCart);
    window.addEventListener('belzo:cart-bump', onBump);
    return () => {
      window.removeEventListener('belzo:cart', onCart);
      window.removeEventListener('belzo:cart-bump', onBump);
      clearTimeout(timer);
    };
  }, []);

  // Read the cart once per page load for the badge. Only a phone has the bar, so a computer skips the request.
  useEffect(() => {
    if (!isPhoneLayout()) return;
    void cartApi.get(accessToken ?? undefined).catch(() => undefined);
  }, [accessToken]);

  if (tabBarHidden(pathname)) return null;
  const open = activeTab(pathname);
  const showPill = count > 0 && !cartPillHidden(pathname);

  return (
    <>
      {showPill && (
        <Link href="/cart" className={`mpill${bump ? ' is-bump' : ''}`} data-testid="view-cart-pill" aria-label={`View cart, ${itemsLabel(count)}`}>
          <span className="mpill__thumbs" aria-hidden="true">
            {thumbs.map((src, i) => (
              <span key={i} className="mpill__thumb" style={{ left: i * 20, zIndex: thumbs.length - i }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src ? <img src={src} alt="" /> : '🛒'}
              </span>
            ))}
          </span>
          <span className="mpill__text">
            <strong>View cart</strong>
            <span>{itemsLabel(count)}</span>
          </span>
          <span className="mpill__go" aria-hidden="true">›</span>
        </Link>
      )}
      <nav className="mtab" aria-label="Main" data-testid="mobile-tabbar">
        {TABS.map((t) => {
          const on = open === t.id;
          const badge = t.id === 'cart' ? badgeText(count) : null;
          return (
            <Link key={t.id} href={t.href} className={`mtab__item${on ? ' is-on' : ''}`} aria-current={on ? 'page' : undefined} data-testid={`tab-${t.id}`}>
              <span className={`mtab__ic${t.id === 'cart' && bump ? ' is-bump' : ''}`} {...(t.id === 'cart' ? { 'data-cart-target': '' } : {})}>
                <TabIcon id={t.id} />
                {badge && (
                  <em className="mtab__badge" data-testid="tab-cart-count">
                    {badge}
                  </em>
                )}
              </span>
              <span className="mtab__label">{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
