'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { roleLabel } from '@belzo/shared';
import { adminLogout } from '@/lib/admin-api';
import { NAV_GROUPS, mayOpenPath, visibleGroups } from './admin-nav';
import { AdminSessionProvider, useAdminSession } from './admin-session';
import { NoAccess, Welcome } from './no-access';

/** Admin chrome: grouped icon sidebar + top bar. Hidden on the login screen. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Separate keys: signing in starts a fresh session, never the signed-out state left over from before.
  if (pathname === '/admin/login') return <AdminSessionProvider key="login">{children}</AdminSessionProvider>;
  return (
    <AdminSessionProvider key="app">
      <Chrome pathname={pathname}>{children}</Chrome>
    </AdminSessionProvider>
  );
}

function Chrome({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const router = useRouter();
  const { me, state, can, refresh, clear } = useAdminSession();

  // Ask the server who we are on every page change, so a change of access shows at the next click.
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    if (state === 'signed-out') router.push('/admin/login');
  }, [state, router]);

  const groups = visibleGroups(NAV_GROUPS, can);
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));
  async function logout() {
    await adminLogout();
    clear();
    router.push('/admin/login');
  }

  const name = me?.name ?? '';
  const typeLabel = me ? (me.isSuperAdmin ? 'Super Admin' : me.roles[0] ? roleLabel(me.roles[0]) : 'No staff type') : '';

  let body: React.ReactNode;
  if (state !== 'ready' || !me) {
    body = <p role="status" className="acc-loading">Loading…</p>;
  } else if (pathname === '/admin' && !can('dashboard.view')) {
    body = <Welcome name={me.name} can={can} />;
  } else if (!mayOpenPath(pathname, can)) {
    body = <NoAccess can={can} />;
  } else {
    body = children;
  }

  return (
    <div className="admin-shell" data-testid="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__logo">B</span>
          <span>Belzo <em>Admin</em></span>
        </div>
        <nav className="admin-nav">
          {groups.map((g, i) => (
            <div className="admin-nav__group" key={i}>
              {g.title && <div className="admin-nav__title">{g.title}</div>}
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`admin-nav__link${isActive(it.href) ? ' is-active' : ''}`}
                  data-testid={it.testid}
                >
                  <span className="admin-nav__icon">{it.icon}</span>
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="admin-main-wrap">
        <header className="admin-topbar">
          <div className="admin-topbar__search">
            <span aria-hidden="true">🔍</span>
            <input placeholder="Search orders, products, customers…" aria-label="Search" />
          </div>
          <div className="admin-topbar__right">
            <button className="admin-topbar__icon" aria-label="Notifications">🔔</button>
            <div className="admin-topbar__profile" data-testid="admin-profile">
              <span className="admin-topbar__avatar">{(name.trim()[0] ?? 'A').toUpperCase()}</span>
              <span className="admin-topbar__name">
                {name || 'Admin'}
                {typeLabel && <small className="acc-typebadge"> · {typeLabel}</small>}
              </span>
            </div>
            <button className="admin-topbar__logout" onClick={logout} data-testid="admin-logout">
              Logout
            </button>
          </div>
        </header>
        <main className="admin-content">{body}</main>
      </div>
    </div>
  );
}
