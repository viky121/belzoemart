'use client';
import { useState } from 'react';
import { roleLabel, validRoleName } from '@belzo/shared';
import { ApiClientError } from '@/lib/api-client';
import { adminFetch } from '@/lib/admin-api';
import { PermissionPicker } from './permission-picker';
import { permissionSummary, samePermissions, sensitiveTicked, type RoleRow } from './access-ui';

export function errorText(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return err instanceof ApiClientError ? err.payload.message : fallback;
}

/** List of staff types, plus the editor for one type. */
export function RolesPanel({ roles, onChanged }: { roles: RoleRow[]; onChanged: () => void }) {
  // null = list only, 'new' = adding, otherwise the type being edited
  const [editing, setEditing] = useState<RoleRow | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function remove(role: RoleRow) {
    if (!window.confirm(`Delete the staff type "${roleLabel(role.name)}"?`)) return;
    try {
      await adminFetch(`/admin/roles/${role.id}`, { method: 'DELETE' });
      setMessage(`"${roleLabel(role.name)}" deleted.`);
      onChanged();
    } catch (err) {
      setMessage(errorText(err));
    }
  }

  if (editing) {
    return (
      <RoleEditor
        role={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={(name) => {
          setEditing(null);
          setMessage(`"${roleLabel(name)}" saved. It applies on the next click of everyone who has it.`);
          onChanged();
        }}
      />
    );
  }

  return (
    <section data-testid="roles-panel">
      <div className="acc-head">
        <p className="acc-hint">A staff type is a set of things a person can do. Make as many as you need.</p>
        <button type="button" className="acc-btn acc-btn--primary" onClick={() => setEditing('new')} data-testid="role-add">
          Add staff type
        </button>
      </div>
      {message && <p role="status" className="acc-msg" data-testid="roles-msg">{message}</p>}
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>What it can do</th>
              <th>Staff</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} data-testid={`role-row-${r.name}`}>
                <td>
                  <strong>{roleLabel(r.name)}</strong>
                  {r.isSystem && <em className="acc-badge">Protected</em>}
                  {r.description && <small className="acc-sub">{r.description}</small>}
                </td>
                <td>{r.isSystem ? 'Everything' : permissionSummary(r.permissions)}</td>
                <td>{r.staffCount}</td>
                <td className="acc-actions">
                  <button type="button" className="acc-link" onClick={() => setEditing(r)} data-testid={`role-edit-${r.name}`}>
                    {r.isSystem ? 'View' : 'Edit'}
                  </button>
                  {!r.isSystem && (
                    <button
                      type="button"
                      className="acc-link acc-link--danger"
                      disabled={r.staffCount > 0}
                      title={r.staffCount > 0 ? 'Move the staff to another type first' : undefined}
                      onClick={() => void remove(r)}
                      data-testid={`role-delete-${r.name}`}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RoleEditor({
  role,
  onSaved,
  onCancel,
}: {
  role: RoleRow | null;
  onSaved: (name: string) => void;
  onCancel: () => void;
}) {
  const locked = role?.isSystem === true;
  const [name, setName] = useState(role ? roleLabel(role.name) : '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanName = validRoleName(name);
  const changed =
    !role || (role.name !== name.trim() && roleLabel(role.name) !== name.trim()) || role.description !== description.trim() || !samePermissions(role.permissions, perms);
  const risky = sensitiveTicked(perms);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!cleanName) {
      setError('Give the type a name of 2 to 40 letters or numbers. "Super Admin" is reserved.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { name: cleanName, description: description.trim(), permissions: perms };
      if (role) await adminFetch(`/admin/roles/${role.id}`, { method: 'PATCH', body });
      else await adminFetch('/admin/roles', { method: 'POST', body });
      onSaved(cleanName);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-card acc-editor" onSubmit={save} data-testid="role-editor">
      <h2>{locked ? roleLabel(role!.name) : role ? `Edit ${roleLabel(role.name)}` : 'New staff type'}</h2>
      {locked && <p className="acc-hint">The Super Admin type can do everything and cannot be changed or deleted.</p>}
      <div className="acc-fields">
        <label>
          Name
          <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} maxLength={40} placeholder="e.g. Store manager" data-testid="role-name" />
        </label>
        <label>
          What is this type for? (optional)
          <input className="auth-input" value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} maxLength={300} data-testid="role-description" />
        </label>
      </div>
      <h3>What can this type do?</h3>
      <PermissionPicker value={perms} onChange={setPerms} readOnly={locked} all={locked} />
      {risky.length > 0 && !locked && (
        <p className="acc-warn" role="note" data-testid="role-sensitive">
          Careful: this type can use {risky.map((r) => r.label.toLowerCase()).join(', ')}. These show costs, profit or secret keys.
        </p>
      )}
      {error && <p role="alert" className="acc-error" data-testid="role-error">{error}</p>}
      <div className="acc-footer">
        <span className="acc-hint">{locked ? 'Everything' : permissionSummary(perms)}</span>
        <button type="button" className="acc-btn" onClick={onCancel}>
          {locked ? 'Back' : 'Cancel'}
        </button>
        {!locked && (
          <button type="submit" className="acc-btn acc-btn--primary" disabled={busy || !changed} data-testid="role-save">
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </form>
  );
}
