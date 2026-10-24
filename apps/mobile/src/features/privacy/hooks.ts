import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { DataRequest } from '@/api/types';
import { useSessionStore } from '@/store/session';

import { fetchDataRequests, requestDeletion, requestExport } from './api';

/** Data requests; polls every 5 s while any request is pending/processing (design §11). */
export function useDataRequests() {
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  return useQuery<DataRequest[]>({
    queryKey: qk.dataRequests,
    queryFn: fetchDataRequests,
    enabled: isCustomer,
    staleTime: STALE.default,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === 'pending' || r.status === 'processing') ? 5000 : false,
  });
}

export function useRequestExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requestExport,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.dataRequests }),
  });
}

export function useRequestDeletion() {
  return useMutation({ mutationFn: requestDeletion });
}
