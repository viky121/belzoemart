import { apiRequest } from '@/api/client';
import type { NotificationItem } from '@/api/types';

export function fetchNotifications(): Promise<NotificationItem[]> {
  return apiRequest<NotificationItem[]>('/notifications', { auth: 'required' });
}

export function markNotificationsRead(ids: string[]): Promise<unknown> {
  return apiRequest('/notifications/read', { method: 'POST', auth: 'required', body: { ids } });
}
