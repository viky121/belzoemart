import type { MediaItem } from '@/lib/admin-api';

/**
 * Human-readable file size. Bytes under 1 KB show as bytes, under 1 MB as KB,
 * otherwise MB — one decimal place for KB/MB (e.g. "12.3 KB", "1.2 MB").
 */
export function formatMediaSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Sort media newest-first by `lastModified` (ISO strings compare correctly),
 * with unknown dates (null) pushed to the end. Returns a new array.
 */
export function sortMediaItems(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => {
    if (a.lastModified === b.lastModified) return 0;
    if (a.lastModified === null) return 1;
    if (b.lastModified === null) return -1;
    return b.lastModified.localeCompare(a.lastModified);
  });
}

/** Short upload date for a media tile (locale date, or "—" when unknown). */
export function formatMediaDate(lastModified: string | null): string {
  if (!lastModified) return '—';
  const d = new Date(lastModified);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}
