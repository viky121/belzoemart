'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ToastAction } from '@/lib/cart-api';

interface ToastState {
  message: string;
  action?: ToastAction;
}

/** Lightweight global toast — listens for `belzo:toast` events (e.g. add to cart), with an optional link button. */
export function Toaster() {
  const [toast, setToast] = useState<ToastState | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; action?: ToastAction }>).detail;
      if (!detail?.message) return;
      setToast({ message: detail.message, action: detail.action });
      clearTimeout(timer);
      // A message with a button stays a little longer, so there is time to tap it.
      timer = setTimeout(() => setToast(null), detail.action ? 3600 : 2200);
    };
    window.addEventListener('belzo:toast', onToast);
    return () => {
      window.removeEventListener('belzo:toast', onToast);
      clearTimeout(timer);
    };
  }, []);
  if (!toast) return null;
  return (
    <div className={`belzo-toast${toast.action ? ' belzo-toast--action' : ''}`} role="status" aria-live="polite">
      <span>✓ {toast.message}</span>
      {toast.action && (
        <Link href={toast.action.href} className="belzo-toast__btn" onClick={() => setToast(null)} data-testid="toast-action">
          {toast.action.label}
        </Link>
      )}
    </div>
  );
}
