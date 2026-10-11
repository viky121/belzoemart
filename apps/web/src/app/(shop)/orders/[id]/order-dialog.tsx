'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OrderDialogProps {
  title: string;
  /** Small line under the title (e.g. "Step 2 of 5"). */
  subtitle?: ReactNode;
  onClose: () => void;
  /** While true, Esc / overlay click / the close button do nothing. */
  busy?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
}

/**
 * Accessible modal used by the order-detail flows: role=dialog + aria-modal,
 * labelled by its title, Esc / overlay click to close (unless busy), focus
 * moved inside on open, Tab kept inside, focus restored to the opener on
 * close, and background scroll locked.
 */
export function OrderDialog({ title, subtitle, onClose, busy = false, footer, children, testId }: OrderDialogProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first =
      bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      cardRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      cardRef.current;
    first?.focus();
    document.body.classList.add('od-locked');

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!busyRef.current) {
          e.preventDefault();
          closeRef.current();
        }
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const nodes = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstNode || !cardRef.current.contains(active))) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && (active === lastNode || !cardRef.current.contains(active))) {
        e.preventDefault();
        firstNode.focus();
      }
    }
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('od-locked');
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div
      className="od-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="od-modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
      >
        <div className="od-modal__head">
          <div>
            <h2 id={titleId} className="od-modal__title">
              {title}
            </h2>
            {subtitle && <p className="od-modal__sub">{subtitle}</p>}
          </div>
          <button type="button" className="od-modal__close" aria-label="Close" onClick={onClose} disabled={busy}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div ref={bodyRef} className="od-modal__body">
          {children}
        </div>
        {footer && <div className="od-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
