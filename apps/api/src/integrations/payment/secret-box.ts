import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption (AES-256-GCM) for secrets stored in the database, so a copy
 * of the settings table does not reveal the payment keys. The key is derived from a
 * server-side secret that never reaches the database.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */
function key(secret: string): Buffer {
  return createHash('sha256').update(`gateway-secrets:${secret}`).digest();
}

export function encryptSecret(plain: string, serverSecret: string): string {
  if (!serverSecret) throw new Error('No server secret available to encrypt with');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(serverSecret), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

/** Returns null when the value is malformed, tampered with, or was sealed with another secret. */
export function decryptSecret(sealed: string, serverSecret: string): string | null {
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !serverSecret) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(serverSecret), Buffer.from(parts[1]!, 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
