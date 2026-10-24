import { apiRequest } from '@/api/client';
import type { DataRequest } from '@/api/types';

export function requestExport(): Promise<DataRequest> {
  return apiRequest<DataRequest>('/me/data/export', { method: 'POST', auth: 'required' });
}

export function requestDeletion(): Promise<unknown> {
  return apiRequest('/me/data/deletion', { method: 'POST', auth: 'required' });
}

export function fetchDataRequests(): Promise<DataRequest[]> {
  return apiRequest<DataRequest[]>('/me/data/requests', { auth: 'required' });
}
