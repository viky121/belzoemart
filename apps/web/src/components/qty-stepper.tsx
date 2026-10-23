'use client';
import { useEffect, useState } from 'react';
import { MAX_CART_QTY } from '@belzo/shared';
import { cleanQtyDraft, parseQty } from '@/lib/qty';

export interface QtyStepperProps {
  /** The current quantity. */
  value: number;
  /** Called with the new quantity after a − / + click, or when typing is finished (Enter / leaving the box). */
  onCommit: (next: number) => void;
  /** Optional: called while typing, for every valid number (e.g. to update a price table live). */
  onLiveChange?: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Class of the outer box, which decides the look (`qty-stepper`, `cline__qty`). */
  className: string;
  /** data-testid of the number box. */
  testId?: string;
  /** data-testid of the whole stepper. */
  rootTestId?: string;
}

/** − [ number ] + : the number can be clicked and typed over, or changed with the buttons. */
export function QtyStepper({
  value,
  onCommit,
  onLiveChange,
  min = 1,
  max = MAX_CART_QTY,
  disabled = false,
  className,
  testId,
  rootTestId,
}: QtyStepperProps) {
  // What is typed in the box right now. It can be empty while the customer is retyping.
  const [draft, setDraft] = useState(String(value));
  // Show the real quantity again whenever it changes, and when a save finishes (so a failed save
  // does not leave the typed number on screen).
  useEffect(() => setDraft(String(value)), [value, disabled]);

  function finish() {
    const next = parseQty(draft, min, max, value);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <div className={className} data-testid={rootTestId}>
      <button
        type="button"
        onClick={() => onCommit(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label="Quantity"
        className="qty-input"
        data-testid={testId}
        value={draft}
        disabled={disabled}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const cleaned = cleanQtyDraft(e.target.value);
          setDraft(cleaned);
          if (onLiveChange && cleaned !== '') onLiveChange(parseQty(cleaned, min, max, value));
        }}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish();
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (value < max) onCommit(value + 1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (value > min) onCommit(value - 1);
          }
        }}
      />
      <button
        type="button"
        onClick={() => onCommit(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
