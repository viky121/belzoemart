import './admin.css';
import { AdminShell } from './admin-shell';

/**
 * Admin panel shell (FR-7-13): grouped sidebar + top bar + content area.
 * Route protection is enforced client-side per page via the admin API client
 * (a 401 triggers a refresh; failure redirects to /admin/login). The login page
 * renders without the shell (handled inside AdminShell).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
