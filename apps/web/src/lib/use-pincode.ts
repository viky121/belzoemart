'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api-client';
import { safeLocal } from './safe-storage';

const KEY = 'belzo:pincode';
const EVT = 'belzo:pincode';
const PIN_RE = /^[1-9]\d{5}$/;

interface ServiceabilityResponse {
  serviceable: boolean;
  configured: boolean;
}

function readStored(): string | null {
  const v = safeLocal.get(KEY);
  return v && PIN_RE.test(v) ? v : null;
}

async function checkPin(pin: string): Promise<ServiceabilityResponse> {
  return apiFetch<ServiceabilityResponse>(`/settings/serviceability?pincode=${pin}`).catch(() => ({
    serviceable: true,
    configured: false,
  }));
}

/**
 * Shared delivery-PIN state for the storefront.
 *
 * - Persists the chosen PIN in localStorage so guests are asked only once.
 * - For a logged-in customer with no stored PIN, auto-adopts their default
 *   address PIN (so signed-in users are never prompted).
 * - Re-checks serviceability (public endpoint) whenever the PIN changes and
 *   broadcasts changes so the header widget and product page stay in sync.
 */
export function usePincode() {
  const { customer, authFetch } = useAuth();
  const [pincode, setPinState] = useState<string | null>(null);
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);

  const setPincode = useCallback((pin: string) => {
    if (typeof window === 'undefined' || !PIN_RE.test(pin)) return;
    safeLocal.set(KEY, pin);
    setPinState(pin);
    window.dispatchEvent(new Event(EVT));
  }, []);

  // Initial read from storage.
  useEffect(() => {
    setPinState(readStored());
    setReady(true);
  }, []);

  // Keep in sync across components (same tab via custom event) and tabs.
  useEffect(() => {
    const onChange = () => setPinState(readStored());
    window.addEventListener(EVT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  // Logged-in + no stored PIN → adopt their default address PIN silently.
  useEffect(() => {
    if (!customer || readStored()) return;
    let active = true;
    void (async () => {
      const addrs = await authFetch<Array<{ pincode: string; isDefault?: boolean }>>(
        '/me/addresses',
      ).catch(() => [] as Array<{ pincode: string; isDefault?: boolean }>);
      const def = addrs.find((a) => a.isDefault) ?? addrs[0];
      if (active && def?.pincode && PIN_RE.test(def.pincode)) setPincode(def.pincode);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  // Recompute serviceability whenever the PIN changes.
  useEffect(() => {
    if (!pincode) {
      setServiceable(null);
      setConfigured(false);
      return;
    }
    let active = true;
    void checkPin(pincode).then((r) => {
      if (!active) return;
      setServiceable(r.serviceable);
      setConfigured(r.configured);
    });
    return () => {
      active = false;
    };
  }, [pincode]);

  return { pincode, serviceable, configured, ready, setPincode };
}
