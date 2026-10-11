/** Storage folder for customer return photos (`returns/<uuid>.<ext>`). */
export const RETURN_MEDIA_FOLDER = 'returns';

// The extension comes from the uploaded file name (sanitised to [a-z0-9] by
// storeCustomerImage), so it can be long or the whole name when there is no dot.
const RETURN_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

/**
 * True only for a URL produced by the return-photo upload endpoint: exactly
 * `<prefix><uuid>.<ext>` where `prefix` is `storage.getUrl('returns/')`.
 * Rejects other hosts, other folders, path traversal and query strings.
 */
export function isOwnReturnImageUrl(url: string, prefix: string): boolean {
  return url.startsWith(prefix) && RETURN_IMAGE_NAME.test(url.slice(prefix.length));
}
