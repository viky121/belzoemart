'use client';

import { WEIGHT_UNITS, WEIGHT_UNIT_LABELS, isWeightUnit } from '@belzo/shared';
import type { WeightInput } from '@/lib/weight-form';

/** Weight number + unit dropdown (kg, gm, count, pc, litre, ml) for the product / variant forms. */
export function WeightField({
  value,
  onChange,
  required = false,
  testId,
}: {
  value: WeightInput;
  onChange: (next: WeightInput) => void;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="auth-label">Weight{required ? ' *' : ''}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="auth-input"
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          style={{ flex: 1, minWidth: 0 }}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          placeholder="e.g. 500"
          data-testid={testId}
        />
        <select
          className="auth-input"
          style={{ width: 96, flex: '0 0 auto' }}
          value={value.unit}
          onChange={(e) => {
            const unit = e.target.value;
            if (isWeightUnit(unit)) onChange({ ...value, unit });
          }}
          aria-label="Weight unit"
          data-testid={testId ? `${testId}-unit` : undefined}
        >
          {WEIGHT_UNITS.map((u) => (
            <option key={u} value={u}>
              {WEIGHT_UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
