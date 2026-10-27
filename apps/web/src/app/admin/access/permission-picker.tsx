import { editableGroups, groupState, setGroup, togglePermission } from './access-ui';

/** The tick boxes of a staff type, grouped by area. Controlled: the parent keeps the list. */
export function PermissionPicker({
  value,
  onChange,
  readOnly = false,
  all = false,
}: {
  value: readonly string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
  /** Show every box ticked (the Super Admin type). */
  all?: boolean;
}) {
  return (
    <div className="acc-picker" data-testid="permission-picker">
      {editableGroups().map((g) => {
        const state = all ? 'all' : groupState(value, g.items);
        return (
          <fieldset className="acc-group" key={g.group}>
            <legend>
              <span>{g.group}</span>
              {!readOnly && g.items.length > 1 && (
                <button
                  type="button"
                  className="acc-link"
                  onClick={() => onChange?.(setGroup(value, g.items, state !== 'all'))}
                  data-testid={`group-toggle-${g.group}`}
                >
                  {state === 'all' ? 'Clear' : 'Select all'}
                </button>
              )}
            </legend>
            {g.items.map((p) => {
              const checked = all || value.includes(p.key);
              return (
                <label className="acc-perm" key={p.key}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly}
                    onChange={(e) => onChange?.(togglePermission(value, p.key, e.target.checked))}
                    data-testid={`perm-${p.key}`}
                  />
                  <span className="acc-perm__text">
                    <span className="acc-perm__label">
                      {p.label}
                      {p.sensitive && <em className="acc-badge acc-badge--warn">Sensitive</em>}
                    </span>
                    <small>{p.help}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
