import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { NotificationItem } from '@/api/types';
import { useSessionStore } from '@/store/session';

import { fetchNotifications, markNotificationsRead } from './api';

/** Customer notifications; only runs when signed in. */
export function useNotifications() {
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  return useQuery<NotificationItem[]>({
    queryKey: qk.notifications,
    queryFn: fetchNotifications,
    enabled: isCustomer,
    staleTime: STALE.default,
  });
}

/** Unread count for the Home bell badge (reads the same cache). */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => n.readAt === null).length;
}

/** Marks the given ids read and optimistically updates the cache. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    onSuccess: (_res, ids) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<NotificationItem[]>(qk.notifications, (prev) =>
        (prev ?? []).map((n) => (idSet.has(n.id) && n.readAt === null ? { ...n, readAt: new Date().toISOString() } : n)),
      );
    },
  });
}
