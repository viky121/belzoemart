'use client';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { RolesPanel, errorText } from './roles-panel';
import { StaffPanel } from './staff-panel';
import type { RoleRow, StaffRow } from './access-ui';

type Tab = 'staff' | 'types';

/** Staff and staff types: who can sign in to the admin panel and what each type may do. Super Admin only. */
export default function AccessPage() {
  const [tab, setTab] = useState<Tab>('staff');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([adminFetch<StaffRow[]>('/admin/users'), adminFetch<RoleRow[]>('/admin/roles')]);
      setStaff(s);
      setRoles(r);
      setError(null);
    } catch (err) {
      setError(errorText(err, 'Could not load staff.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-testid="admin-access">
      <h1>Staff and types</h1>
      <div className="acc-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'staff'} className={tab === 'staff' ? 'is-on' : undefined} onClick={() => setTab('staff')} data-testid="tab-staff">
          Staff ({staff.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'types'} className={tab === 'types' ? 'is-on' : undefined} onClick={() => setTab('types')} data-testid="tab-types">
          Staff types ({roles.length})
        </button>
      </div>
      {error && <p role="alert" className="acc-error">{error}</p>}
      {loading ? (
        <p role="status">Loading…</p>
      ) : tab === 'staff' ? (
        <StaffPanel staff={staff} roles={roles} onChanged={() => void load()} />
      ) : (
        <RolesPanel roles={roles} onChanged={() => void load()} />
      )}
    </div>
  );
}
