'use client';
import { useState } from 'react';
import { roleLabel, strongPasswordSchema } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';
import { useAdminSession } from '../admin-session';
import { assignableRoles, type RoleRow, type StaffRow } from './access-ui';
import { errorText } from './roles-panel';

/** First problem with a password, in plain words, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  const r = strongPasswordSchema.safeParse(password);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Password is too weak.');
}

export function StaffPanel({ staff, roles, onChanged }: { staff: StaffRow[]; roles: RoleRow[]; onChanged: () => void }) {
  const { me } = useAdminSession();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section data-testid="staff-panel">
      <div className="acc-head">
        <p className="acc-hint">Each person has one staff type. Switch someone off to stop them signing in at once.</p>
        <button type="button" className="acc-btn acc-btn--primary" onClick={() => setAdding((v) => !v)} data-testid="staff-add">
          {adding ? 'Close' : 'Add staff'}
        </button>
      </div>
      {message && <p role="status" className="acc-msg" data-testid="staff-msg">{message}</p>}
      {adding && (
        <AddStaff
          roles={roles}
          onDone={(who) => {
            setAdding(false);
            setMessage(`${who} added. Tell them their email and password.`);
            onChanged();
          }}
        />
      )}
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>2-step login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <StaffRowView
                key={s.id}
                s={s}
                isSelf={s.id === me?.id}
                roles={roles}
                open={openId === s.id}
                onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                onChanged={(note) => {
                  if (note) setMessage(note);
                  onChanged();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StaffRowView({
  s,
  isSelf,
  roles,
  open,
  onToggle,
  onChanged,
}: {
  s: StaffRow;
  isSelf: boolean;
  roles: RoleRow[];
  open: boolean;
  onToggle: () => void;
  onChanged: (note?: string) => void;
}) {
  return (
    <>
      <tr data-testid={`staff-row-${s.email}`} className={s.status === 'disabled' ? 'acc-off' : undefined}>
        <td>
          <strong>{s.name}</strong>
          {isSelf && <em className="acc-badge">You</em>}
          <small className="acc-sub">{s.email}</small>
        </td>
        <td>
          {s.role ? roleLabel(s.role.name) : <span className="acc-hint">No type</span>}
          {s.roleCount > 1 && <small className="acc-sub">+{s.roleCount - 1} more</small>}
        </td>
        <td>
          <span className={`admin-status ${s.status === 'active' ? 'admin-status--ok' : 'admin-status--bad'}`}>
            {s.status === 'active' ? 'Active' : 'Switched off'}
          </span>
        </td>
        <td>{s.mfaEnabled ? 'On' : 'Off'}</td>
        <td className="acc-actions">
          <button type="button" className="acc-link" onClick={onToggle} data-testid={`staff-manage-${s.email}`}>
            {open ? 'Close' : 'Manage'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <ManageStaff s={s} isSelf={isSelf} roles={roles} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

function AddStaff({ roles, onDone }: { roles: RoleRow[]; onDone: (who: string) => void }) {
  const options = assignableRoles(roles);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/users', { method: 'POST', body: { name, email, password, roleId } });
      onDone(name.trim());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-card acc-editor" onSubmit={submit} data-testid="staff-add-form">
      <h2>Add staff</h2>
      <div className="acc-fields">
        <label>
          Name
          <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} data-testid="staff-name" />
        </label>
        <label>
          Email
          <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="staff-email" />
        </label>
        <label>
          Password
          <input className="auth-input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="staff-password" />
          <small>At least 8 characters with a capital letter, a small letter, a number and a symbol.</small>
        </label>
        <label>
          Staff type
          <select className="auth-input" value={roleId} onChange={(e) => setRoleId(e.target.value)} required data-testid="staff-type">
            {options.length === 0 && <option value="">Make a staff type first</option>}
            {options.map((r) => (
              <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="acc-error" data-testid="staff-error">{error}</p>}
      <div className="acc-footer">
        <button type="submit" className="acc-btn acc-btn--primary" disabled={busy || !roleId} data-testid="staff-save">
          {busy ? 'Adding…' : 'Add staff'}
        </button>
      </div>
    </form>
  );
}

function ManageStaff({
  s,
  isSelf,
  roles,
  onChanged,
}: {
  s: StaffRow;
  isSelf: boolean;
  roles: RoleRow[];
  onChanged: (note?: string) => void;
}) {
  const options = assignableRoles(roles);
  const [name, setName] = useState(s.name);
  const [roleId, setRoleId] = useState(s.role?.id ?? '');
  const [password, setPassword] = useState('');
  const [otpUrl, setOtpUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, note: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged(note);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: Record<string, unknown>) => adminFetch(`/admin/users/${s.id}`, { method: 'PATCH', body }).then(() => undefined);
  const typeChanged = roleId !== (s.role?.id ?? '') && roleId !== '';

  return (
    <div className="acc-manage" data-testid="staff-manage">
      {s.isSuperAdmin && <p className="acc-hint">This person is a Super Admin. Their type cannot be changed from here.</p>}
      <div className="acc-fields">
        <label>
          Name
          <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        {!s.isSuperAdmin && (
          <label>
            Staff type
            <select className="auth-input" value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={isSelf} data-testid="manage-type">
              {!s.role && <option value="">No type</option>}
              {options.map((r) => (
                <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="acc-row">
        <button
          type="button"
          className="acc-btn acc-btn--primary"
          disabled={busy || (name.trim() === s.name && !typeChanged) || name.trim() === ''}
          onClick={() => void run(() => patch({ name: name.trim(), ...(typeChanged ? { roleId } : {}) }), `${s.name} updated. It applies on their next click.`)}
          data-testid="manage-save"
        >
          Save changes
        </button>
        <button
          type="button"
          className="acc-btn"
          disabled={busy || isSelf}
          title={isSelf ? 'You cannot switch yourself off' : undefined}
          onClick={() =>
            void run(
              () => patch({ status: s.status === 'active' ? 'disabled' : 'active' }),
              s.status === 'active' ? `${s.name} is switched off and signed out.` : `${s.name} is switched on.`,
            )
          }
          data-testid="manage-status"
        >
          {s.status === 'active' ? 'Switch off' : 'Switch on'}
        </button>
      </div>

      <div className="acc-row">
        <input
          className="auth-input"
          type="text"
          autoComplete="off"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="manage-password"
        />
        <button
          type="button"
          className="acc-btn"
          disabled={busy || password === ''}
          onClick={() => {
            const problem = passwordProblem(password);
            if (problem) {
              setError(problem);
              return;
            }
            void run(async () => {
              await adminFetch(`/admin/users/${s.id}/password`, { method: 'POST', body: { password } });
              setPassword('');
            }, `Password changed for ${s.name}. They are signed out everywhere.`);
          }}
          data-testid="manage-reset"
        >
          Reset password
        </button>
      </div>

      <div className="acc-row">
        <span>2-step login is {s.mfaEnabled ? 'on' : 'off'}.</span>
        {s.mfaEnabled ? (
          <button
            type="button"
            className="acc-btn"
            disabled={busy}
            onClick={() => void run(async () => { await adminFetch(`/admin/users/${s.id}/mfa`, { method: 'DELETE' }); setOtpUrl(null); }, `2-step login turned off for ${s.name}.`)}
            data-testid="manage-mfa-off"
          >
            Turn off
          </button>
        ) : (
          <button
            type="button"
            className="acc-btn"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await adminFetch<{ otpauthUrl: string }>(`/admin/users/${s.id}/mfa`, { method: 'POST' });
                setOtpUrl(r.otpauthUrl);
              }, `2-step login turned on for ${s.name}.`)
            }
            data-testid="manage-mfa-on"
          >
            Turn on
          </button>
        )}
      </div>
      {otpUrl && (
        <p className="acc-warn" data-testid="manage-otp">
          Add this to their authenticator app now. It is shown only once:
          <code className="acc-code">{otpUrl}</code>
        </p>
      )}
      {error && <p role="alert" className="acc-error" data-testid="manage-error">{error}</p>}
    </div>
  );
}
