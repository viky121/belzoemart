import Link from 'next/link';
import { NAV_GROUPS, visibleGroups, type CanFn } from './admin-nav';

/** Shown instead of a page the admin's staff type does not open. */
export function NoAccess({ can }: { can: CanFn }) {
  const groups = visibleGroups(NAV_GROUPS, can).map((g) => ({ ...g, items: g.items.filter((i) => i.href !== '/admin') }));
  const links = groups.flatMap((g) => g.items);
  return (
    <div className="acc-noaccess" data-testid="admin-no-access" role="alert">
      <h1>You do not have access</h1>
      <p>Your staff type does not include this page. If you need it, ask the Super Admin to change your access.</p>
      {links.length > 0 && (
        <p>
          You can open:{' '}
          {links.map((l, i) => (
            <span key={l.href}>
              {i > 0 && ', '}
              <Link href={l.href}>{l.label}</Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** The dashboard for someone whose staff type has no dashboard access: a welcome with their pages. */
export function Welcome({ name, can }: { name: string; can: CanFn }) {
  const groups = visibleGroups(NAV_GROUPS, can).map((g) => ({ ...g, items: g.items.filter((i) => i.href !== '/admin') })).filter((g) => g.items.length > 0);
  return (
    <div className="acc-welcome" data-testid="admin-welcome">
      <h1>Welcome, {name}</h1>
      {groups.length === 0 ? (
        <p>No pages are open for your staff type yet. Ask the Super Admin to give you access.</p>
      ) : (
        <>
          <p>Pick a page to start:</p>
          <div className="acc-welcome__grid">
            {groups.flatMap((g) => g.items).map((i) => (
              <Link key={i.href} href={i.href} className="acc-welcome__tile">
                <span aria-hidden="true">{i.icon}</span> {i.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
