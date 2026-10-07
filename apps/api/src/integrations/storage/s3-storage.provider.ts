import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { MediaItem, PutObjectInput, StorageProvider } from './storage.provider';

/** Image extensions surfaced by the media library (matches the upload filter). */
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

/**
 * S3 storage adapter (production). Uploads objects to the configured bucket and
 * returns their public URL (CloudFront CDN if CDN_BASE_URL is set, else the
 * S3 virtual-hosted URL). Credentials come from S3_ACCESS_KEY_ID/SECRET when
 * provided, otherwise the default AWS provider chain (e.g. an EC2 instance
 * role) — so keys never need to live on the box in that setup (SECURITY-12).
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger('S3StorageProvider');
  private readonly bucket = process.env.S3_BUCKET || '';
  private readonly region = process.env.S3_REGION || 'eu-north-1';
  private readonly cdn = (process.env.CDN_BASE_URL || '').replace(/\/$/, '');
  private client?: S3Client;

  private get s3(): S3Client {
    if (!this.client) {
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
      this.client = new S3Client({
        region: this.region,
        // Explicit keys if given; otherwise fall back to the default chain.
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      });
    }
    return this.client;
  }

  async put(input: PutObjectInput): Promise<{ url: string }> {
    if (!this.bucket) {
      throw new Error('S3_BUCKET is not configured');
    }
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
      }),
    );
    this.logger.log(`Uploaded s3://${this.bucket}/${input.key}`);
    return { url: this.getUrl(input.key) };
  }

  getUrl(key: string): string {
    const clean = key.replace(/^\//, '');
    if (this.cdn) return `${this.cdn}/${clean}`;
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${clean}`;
  }

  /**
   * List image objects in the bucket (optionally scoped to `prefix`). Requires
   * s3:ListBucket — if the call fails (e.g. AccessDenied) we log at warn and
   * return an empty list so the admin UI degrades to upload-only (NFR-3.2).
   */
  async list(prefix?: string, limit = 1000): Promise<{ items: MediaItem[] }> {
    if (!this.bucket) return { items: [] };

    try {
      const res = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix || undefined,
          MaxKeys: Math.min(limit, 1000),
        }),
      );

      const items: MediaItem[] = [];
      for (const obj of res.Contents ?? []) {
        const key = obj.Key;
        if (!key || !IMAGE_EXT.test(key)) continue;
        const folder = key.includes('/') ? key.slice(0, key.indexOf('/')) : '';
        if (folder === 'invoices') continue;
        items.push({
          key,
          url: this.getUrl(key),
          folder,
          name: key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
        });
      }

      items.sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));
      return { items: items.slice(0, limit) };
    } catch (err) {
      this.logger.warn(
        `S3 list failed (bucket=${this.bucket}, prefix=${prefix ?? ''}): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return { items: [] };
    }
  }
}
