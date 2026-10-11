/** Storage folder for customer return photos (`returns/<uuid>.<ext>`). */
export const RETURN_MEDIA_FOLDER = 'returns';

const RETURN_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/;

/**
 * True only for a URL produced by the return-photo upload endpoint: exactly
 * `<prefix><uuid>.<ext>` where `prefix` is `storage.getUrl('returns/')`.
 * Rejects other hosts, other folders, path traversal and query strings.
 */
export function isOwnReturnImageUrl(url: string, prefix: string): boolean {
  return url.startsWith(prefix) && RETURN_IMAGE_NAME.test(url.slice(prefix.length));
}
