'use client';

import { useEffect, useState } from 'react';

/** Lightweight global toast — listens for `belzo:toast` events (e.g. add to cart). */
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      if (!detail?.message) return;
      setMsg(detail.message);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2200);
    };
    window.addEventListener('belzo:toast', onToast);
    return () => {
      window.removeEventListener('belzo:toast', onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!msg) return null;
  return (
    <div className="belzo-toast" role="status" aria-live="polite">
      ✓ {msg}
    </div>
  );
}
