import { Injectable } from '@nestjs/common';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MediaItem, PutObjectInput, StorageProvider } from './storage.provider';

/** Image extensions surfaced by the media library (matches the upload filter). */
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

/**
 * Local filesystem storage for development. Writes under `<cwd>/uploads` and
 * serves via a `/uploads/...` URL path. Not for production (use S3).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly root = join(process.cwd(), 'uploads');

  async put(input: PutObjectInput): Promise<{ url: string }> {
    const filePath = join(this.root, input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
    return { url: this.getUrl(input.key) };
  }

  /**
   * Public URL for a stored object. Files are served by the API under
   * `/api/uploads/<key>` (see main.ts static assets), and the reverse proxy
   * routes `/api/*` to the API. We return a HOST-RELATIVE path so images load
   * same-origin over whatever host/scheme the page uses (the EC2 IP or
   * belzoemart.com, HTTP or HTTPS) — avoiding mixed-content blocking. A CDN,
   * when configured, is always an absolute origin.
   */
  getUrl(key: string): string {
    const cdn = (process.env.CDN_BASE_URL || '').replace(/\/$/, '');
    return cdn ? `${cdn}/api/uploads/${key}` : `/api/uploads/${key}`;
  }

  /**
   * Recursively list image files under `<cwd>/uploads` (optionally scoped to a
   * `prefix`/folder). Returns the newest-first `MediaItem` shape. A missing
   * uploads dir yields an empty list. The `invoices/` folder is excluded.
   */
  async list(prefix?: string, limit = 1000): Promise<{ items: MediaItem[] }> {
    const items: MediaItem[] = [];
    await this.walk(this.root, items);

    const scoped = prefix
      ? items.filter((it) => it.key === prefix || it.key.startsWith(`${prefix}/`))
      : items;

    scoped.sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));
    return { items: scoped.slice(0, limit) };
  }

  /** Depth-first walk collecting image files into `out` as MediaItems. */
  private async walk(dir: string, out: MediaItem[]): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      // A missing uploads dir (or any subdir removed mid-walk) means no media.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(full, out);
        continue;
      }
      if (!entry.isFile() || !IMAGE_EXT.test(entry.name)) continue;

      const key = full.slice(this.root.length + 1).replace(/\\/g, '/');
      const folder = key.includes('/') ? key.slice(0, key.indexOf('/')) : '';
      if (folder === 'invoices') continue;

      try {
        const info = await stat(full);
        out.push({
          key,
          url: this.getUrl(key),
          folder,
          name: entry.name,
          size: info.size,
          lastModified: info.mtime.toISOString(),
        });
      } catch {
        // File vanished between readdir and stat — skip it.
      }
    }
  }
}
