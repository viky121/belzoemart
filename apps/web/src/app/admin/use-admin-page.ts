'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-api';

/**
 * Hook for admin pages: loads data via adminFetch and redirects to
 * /admin/login when the session is invalid. Returns the loaded data, a loading
 * flag, and a reload function.
 */
export function useAdminData<T>(path: string): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch(() => {
        setError('Could not load. Please sign in as an admin.');
        router.push('/admin/login');
      })
      .finally(() => setLoading(false));
  }, [path, router]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
