/**
 * Object-storage port. Concrete adapters: local filesystem (dev) and S3 (prod),
 * selected by STORAGE_PROVIDER. Domain code depends only on this interface, so
 * media storage can move to S3+CloudFront without code changes (NFR-3.2).
 */
export interface PutObjectInput {
  key: string; // e.g. products/<id>/<filename>
  body: Buffer;
  contentType: string;
}

/**
 * A single already-stored media object, as surfaced to the admin media library
 * so an admin can reuse an existing server image instead of re-uploading.
 */
export interface MediaItem {
  key: string; // path relative to the storage root, e.g. categories/abc.png
  url: string; // public URL (same as getUrl(key))
  folder: string; // top-level folder, e.g. categories | products | banners
  name: string; // basename, e.g. abc.png
  size: number; // bytes
  lastModified: string | null; // ISO timestamp, or null when unknown
}

export interface StorageProvider {
  put(input: PutObjectInput): Promise<{ url: string }>;
  getUrl(key: string): string;
  /**
   * List already-stored image objects (newest-first is the caller's job).
   * Optionally scoped to a `prefix`/folder and capped at `limit`. Adapters that
   * cannot list (e.g. S3 without s3:ListBucket) degrade to `{ items: [] }` so
   * the UI falls back to upload-only instead of erroring.
   */
  list(prefix?: string, limit?: number): Promise<{ items: MediaItem[] }>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
