import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';

/**
 * Media handling (FR-8, NFR-3.2). Uploads product images/videos via the storage
 * port and returns a CDN-friendly URL. Image optimisation (WebP) is applied at
 * the CDN/edge; the service records the canonical object key.
 */
@Injectable()
export class MediaService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  async uploadProductImage(
    productId: string,
    filename: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ url: string }> {
    const key = `products/${productId}/${Date.now()}-${filename}`;
    return this.storage.put({ key, body, contentType });
  }

  urlFor(key: string): string {
    return this.storage.getUrl(key);
  }
}
