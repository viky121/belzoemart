'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_RETURN_IMAGES, RETURN_REASONS, findReturnReason } from '@belzo/shared';
import { useAuth } from '@/lib/auth-context';
import { uploadReturnImage } from '@/lib/customer-upload';
import {
  RETURN_STEPS,
  buildReturnPayload,
  commentMaxChars,
  photosRequired,
  resolutionLabel,
  resolutionOptions,
  returnEligibility,
  returnStepError,
  variantText,
  type OrderDetail,
  type ReturnDraft,
} from '@/lib/order-view';
import { OrderDialog } from './order-dialog';

interface ReturnRequestModalProps {
  order: OrderDetail;
  onClose: () => void;
  /** Called after a successful request with the message to show on the page. */
  onDone: (message: string) => void;
}

const STEP_TITLES = ['Select items', 'Reason', 'Resolution', 'Photos & details', 'Review'];
/** The hint explaining why Next / Submit is disabled (linked via aria-describedby). */
const HINT_ID = 'return-step-hint';

/** Five-step Return / Replace request: items → reason → resolution → photos → review. */
export function ReturnRequestModal({ order, onClose, onDone }: ReturnRequestModalProps) {
  const { accessToken, authFetch } = useAuth();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ReturnDraft>(() => {
    const elig = returnEligibility(order);
    const only = elig.items.filter((i) => i.maxQty > 0);
    // Pre-select the item when there is only one that can be returned.
    return {
      quantities: only.length === 1 ? { [only[0].id]: 1 } : {},
      reasonCode: null,
      resolution: null,
      images: [],
      comments: '',
    };
  });
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [step]);

  const elig = returnEligibility(order);
  const reason = findReturnReason(draft.reasonCode);
  const options = resolutionOptions(order, draft.reasonCode);
  const stepError = returnStepError(order, draft, step);
  const busy = uploading || submitting;
  const maxChars = commentMaxChars(reason?.label ?? 'Other');

  function setQty(id: string, qty: number) {
    setDraft((d) => ({ ...d, quantities: { ...d.quantities, [id]: qty } }));
  }

  function chooseReason(code: ReturnDraft['reasonCode']) {
    setDraft((d) => {
      const stillValid = resolutionOptions(order, code).some((o) => o.value === d.resolution);
      return { ...d, reasonCode: code, resolution: stillValid ? d.resolution : null };
    });
  }

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setUploadErrors([]);
    const errors: string[] = [];
    let count = draft.images.length;
    for (const f of files) {
      if (count >= MAX_RETURN_IMAGES) {
        errors.push(`${f.name}: you can add up to ${MAX_RETURN_IMAGES} photos`);
        continue;
      }
      try {
        const { url } = await uploadReturnImage(f, accessToken ?? undefined);
        count += 1;
        setDraft((d) => (d.images.length < MAX_RETURN_IMAGES ? { ...d, images: [...d.images, url] } : d));
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : 'Upload failed'}`);
      }
    }
    setUploadErrors(errors);
    setUploading(false);
  }

  function removePhoto(idx: number) {
    setDraft((d) => ({ ...d, images: d.images.filter((_, i) => i !== idx) }));
  }

  async function submit() {
    if (returnStepError(order, draft, RETURN_STEPS)) return;
    setSubmitting(true);
    setError(null);
    try {
      await authFetch('/orders/returns', { method: 'POST', body: buildReturnPayload(order, draft) });
      onDone('Return request submitted. We will review it and schedule a pickup.');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not submit the return. Please try again.');
      setSubmitting(false);
    }
  }

  const selectedItems = order.items.filter((i) => (draft.quantities[i.id] ?? 0) > 0);

  const footer = (
    <>
      {step === 1 ? (
        <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      ) : (
        <button type="button" className="btn btn--outline" onClick={() => setStep((s) => s - 1)} disabled={busy}>
          Back
        </button>
      )}
      {step < RETURN_STEPS ? (
        <button
          type="button"
          className="btn btn--blue"
          onClick={() => setStep((s) => s + 1)}
          disabled={stepError !== null || busy}
          aria-describedby={stepError ? HINT_ID : undefined}
          data-testid="return-next"
        >
          Next
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={submit}
          disabled={stepError !== null || busy}
          aria-busy={submitting}
          aria-describedby={stepError ? HINT_ID : undefined}
          data-testid="return-submit"
        >
          {submitting ? 'Submitting…' : 'Submit return request'}
        </button>
      )}
    </>
  );

  return (
    <OrderDialog
      title="Return / Replace"
      subtitle={`Step ${step} of ${RETURN_STEPS} · ${STEP_TITLES[step - 1]}`}
      onClose={onClose}
      busy={busy}
      footer={footer}
      testId="return-modal"
    >
      <ol className="od-steps" aria-label="Return request progress">
        {STEP_TITLES.map((t, i) => (
          <li
            key={t}
            className={`od-steps__item${i + 1 === step ? ' is-current' : ''}${i + 1 < step ? ' is-done' : ''}`}
            aria-current={i + 1 === step ? 'step' : undefined}
          >
            <span className="od-steps__dot" aria-hidden="true">
              {i + 1 < step ? '✓' : i + 1}
            </span>
            <span className="od-steps__label">{t}</span>
          </li>
        ))}
      </ol>

      <h3 ref={stepHeadingRef} tabIndex={-1} className="od-modal__step-title">
        {STEP_TITLES[step - 1]}
      </h3>

      {step === 1 && (
        <fieldset className="od-field">
          <legend className="od-field__legend">Which items do you want to return?</legend>
          <ul className="od-ritems">
            {order.items.map((item) => {
              const e = elig.items.find((x) => x.id === item.id);
              const max = e?.maxQty ?? 0;
              const qty = draft.quantities[item.id] ?? 0;
              const disabled = max === 0;
              const vt = variantText(item.attributes);
              const checkId = `ret-item-${item.id}`;
              return (
                <li key={item.id} className={`od-ritem${disabled ? ' is-disabled' : ''}${qty > 0 ? ' is-on' : ''}`}>
                  <input
                    id={checkId}
                    type="checkbox"
                    checked={qty > 0}
                    disabled={disabled}
                    onChange={(ev) => setQty(item.id, ev.target.checked ? 1 : 0)}
                  />
                  <label htmlFor={checkId} className="od-ritem__info">
                    <span className="od-ritem__title">{item.title}</span>
                    {vt && <span className="od-ritem__meta">{vt}</span>}
                    <span className="od-ritem__meta">
                      Ordered: {item.quantity}
                      {!disabled && max < item.quantity ? ` · ${max} left to return` : ''}
                    </span>
                    {e?.blockedReason && <span className="od-tag od-tag--muted">{e.blockedReason}</span>}
                  </label>
                  {qty > 0 && (
                    <div className="od-qty" role="group" aria-label={`Quantity to return of ${item.title}`}>
                      <button
                        type="button"
                        className="od-qty__btn"
                        onClick={() => setQty(item.id, Math.max(1, qty - 1))}
                        disabled={qty <= 1}
                        aria-label={`Decrease quantity of ${item.title}`}
                      >
                        −
                      </button>
                      <span className="od-qty__val" aria-live="polite">
                        {qty}
                      </span>
                      <button
                        type="button"
                        className="od-qty__btn"
                        onClick={() => setQty(item.id, Math.min(max, qty + 1))}
                        disabled={qty >= max}
                        aria-label={`Increase quantity of ${item.title}`}
                      >
                        +
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="od-field">
          <legend className="od-field__legend">Why are you returning?</legend>
          <div className="od-radios">
            {RETURN_REASONS.map((r) => (
              <label key={r.code} className={`od-radio${draft.reasonCode === r.code ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="return-reason"
                  value={r.code}
                  checked={draft.reasonCode === r.code}
                  onChange={() => chooseReason(r.code)}
                />
                <span>{r.label}</span>
                {r.photoRequired && <span className="od-tag od-tag--info">Photo required</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step === 3 && (
        <fieldset className="od-field">
          <legend className="od-field__legend">How would you like this resolved?</legend>
          <div className="od-radios">
            {options.map((o) => (
              <label key={o.value} className={`od-radio od-radio--desc${draft.resolution === o.value ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="return-resolution"
                  value={o.value}
                  checked={draft.resolution === o.value}
                  onChange={() => setDraft((d) => ({ ...d, resolution: o.value }))}
                />
                <span>
                  <span className="od-radio__title">{o.label}</span>
                  <span className="od-radio__desc">{o.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step === 4 && (
        <>
          <div className="od-field">
            <p className="od-field__label" id="ret-photos-label">
              Photos of the product {photosRequired(draft.reasonCode) ? '(at least 1 required)' : '(optional)'}
            </p>
            <p className="od-field__help">
              Add clear photos showing the issue, the product label and the packaging. Up to {MAX_RETURN_IMAGES} photos.
            </p>
            <div className="od-photos">
              {draft.images.map((url, i) => (
                <div key={url} className="od-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Return photo ${i + 1}`} />
                  <button
                    type="button"
                    className="od-photo__remove"
                    onClick={() => removePhoto(i)}
                    disabled={busy}
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              ))}
              {draft.images.length < MAX_RETURN_IMAGES && (
                <label className={`od-upload${uploading ? ' is-busy' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="od-upload__input"
                    disabled={busy}
                    aria-describedby="ret-photos-label"
                    onChange={(e) => {
                      void onFiles(e.target.files);
                      e.target.value = '';
                    }}
                    data-testid="return-photo-input"
                  />
                  <span aria-hidden="true" className="od-upload__plus">
                    +
                  </span>
                  <span>{uploading ? 'Uploading…' : 'Add photos'}</span>
                </label>
              )}
            </div>
            <p className="od-sr" aria-live="polite">
              {uploading ? 'Uploading photos' : `${draft.images.length} photo${draft.images.length === 1 ? '' : 's'} added`}
            </p>
            {uploadErrors.length > 0 && (
              <ul className="od-error" role="alert">
                {uploadErrors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="od-field">
            <label htmlFor="ret-comments" className="od-field__label">
              Describe the issue {reason?.commentRequired ? '(required)' : '(optional)'}
            </label>
            <textarea
              id="ret-comments"
              className="od-textarea"
              rows={3}
              maxLength={maxChars}
              value={draft.comments}
              onChange={(e) => setDraft((d) => ({ ...d, comments: e.target.value }))}
              aria-describedby="ret-comments-count"
            />
            <span id="ret-comments-count" className="od-field__count">
              {draft.comments.length}/{maxChars}
            </span>
          </div>
        </>
      )}

      {step === 5 && (
        <div className="od-confirm">
          <dl className="od-summary">
            <div>
              <dt>Items</dt>
              <dd>
                <ul className="od-summary__list">
                  {selectedItems.map((i) => (
                    <li key={i.id}>
                      {i.title} × {draft.quantities[i.id]}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{reason?.label ?? ''}</dd>
            </div>
            <div>
              <dt>Resolution</dt>
              <dd>{draft.resolution ? resolutionLabel(draft.resolution) : ''}</dd>
            </div>
            <div>
              <dt>Photos</dt>
              <dd>
                {draft.images.length === 0 ? (
                  'None'
                ) : (
                  <span className="od-photos od-photos--sm">
                    {draft.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt={`Return photo ${i + 1}`} className="od-thumb" />
                    ))}
                  </span>
                )}
              </dd>
            </div>
            {draft.comments.trim() && (
              <div>
                <dt>Comments</dt>
                <dd>{draft.comments.trim()}</dd>
              </div>
            )}
          </dl>
          <p className="od-callout">
            After we approve your request, a pickup will be scheduled. Please keep the item in its original packaging.
          </p>
          {error && (
            <p className="od-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {stepError && (
        <p id={HINT_ID} className="od-modal__hint">
          {stepError}
        </p>
      )}
    </OrderDialog>
  );
}
