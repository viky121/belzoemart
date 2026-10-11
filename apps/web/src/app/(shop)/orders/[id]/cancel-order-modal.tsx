'use client';

import { useState } from 'react';
import { CANCEL_REASONS, type CancelReasonCode } from '@belzo/shared';
import { useAuth } from '@/lib/auth-context';
import { formatInr } from '@/lib/catalogue-api';
import {
  cancelReasonError,
  cancelReasonText,
  commentMaxChars,
  refundNote,
  shortOrderId,
  type OrderDetail,
} from '@/lib/order-view';
import { OrderDialog } from './order-dialog';

interface CancelOrderModalProps {
  order: OrderDetail;
  onClose: () => void;
  /** Called after a successful cancel with the message to show on the page. */
  onDone: (message: string) => void;
}

/** The hint explaining why Continue is disabled (linked via aria-describedby). */
const HINT_ID = 'cancel-reason-hint';

/** Two-step cancel: pick a standard reason (+ comments), then confirm. */
export function CancelOrderModal({ order, onClose, onDone }: CancelOrderModalProps) {
  const { authFetch } = useAuth();
  const [step, setStep] = useState<'reason' | 'confirm'>('reason');
  const [code, setCode] = useState<CancelReasonCode | null>(null);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = CANCEL_REASONS.find((r) => r.code === code) ?? null;
  const validation = cancelReasonError(code, comments);
  const maxChars = commentMaxChars(reason?.label ?? 'Other');
  const note = refundNote(order);
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);

  async function submit() {
    if (!code || validation) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch(`/orders/${order.id}/cancel`, {
        method: 'POST',
        body: { reason: cancelReasonText(code, comments) },
      });
      onDone(`Your order has been cancelled. ${note}.`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not cancel the order. Please try again.');
      setBusy(false);
    }
  }

  const footer =
    step === 'reason' ? (
      <>
        <button type="button" className="btn btn--outline" onClick={onClose}>
          Keep order
        </button>
        <button
          type="button"
          className="btn btn--blue"
          disabled={validation !== null}
          aria-describedby={validation ? HINT_ID : undefined}
          onClick={() => setStep('confirm')}
          data-testid="cancel-continue"
        >
          Continue
        </button>
      </>
    ) : (
      <>
        <button type="button" className="btn btn--outline" onClick={() => setStep('reason')} disabled={busy}>
          Go back
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={submit}
          disabled={busy}
          aria-busy={busy}
          data-testid="cancel-confirm"
        >
          {busy ? 'Cancelling…' : 'Yes, cancel order'}
        </button>
      </>
    );

  return (
    <OrderDialog
      title="Cancel order"
      subtitle={step === 'reason' ? 'Step 1 of 2 · Reason' : 'Step 2 of 2 · Confirm'}
      onClose={onClose}
      busy={busy}
      footer={footer}
      testId="cancel-modal"
    >
      {step === 'reason' ? (
        <>
          <fieldset className="od-field">
            <legend className="od-field__legend">Why do you want to cancel?</legend>
            <div className="od-radios">
              {CANCEL_REASONS.map((r) => (
                <label key={r.code} className={`od-radio${code === r.code ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={r.code}
                    checked={code === r.code}
                    onChange={() => setCode(r.code)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="od-field">
            <label htmlFor="cancel-comments" className="od-field__label">
              Comments {reason?.commentRequired ? '(required)' : '(optional)'}
            </label>
            <textarea
              id="cancel-comments"
              className="od-textarea"
              rows={3}
              maxLength={maxChars}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              aria-describedby="cancel-comments-count"
              placeholder={reason?.commentRequired ? 'Tell us why you are cancelling' : 'Anything else we should know?'}
            />
            <span id="cancel-comments-count" className="od-field__count">
              {comments.length}/{maxChars}
            </span>
          </div>

          <p className="od-callout">{note}.</p>
          {/* Before a reason is picked the hint is for screen readers only (no visual change). */}
          {validation && (
            <p id={HINT_ID} className={code ? 'od-modal__hint' : 'od-sr'}>
              {validation}
            </p>
          )}
        </>
      ) : (
        <div className="od-confirm">
          <p>Are you sure you want to cancel this order? This cannot be undone.</p>
          <dl className="od-summary">
            <div>
              <dt>Order</dt>
              <dd>#{shortOrderId(order.id)}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>
                {itemCount} item{itemCount === 1 ? '' : 's'} · {formatInr(order.grandTotal)}
              </dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{code ? cancelReasonText(code, comments) : ''}</dd>
            </div>
            <div>
              <dt>Refund</dt>
              <dd>{note}</dd>
            </div>
          </dl>
          {error && (
            <p className="od-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </OrderDialog>
  );
}
