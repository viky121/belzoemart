/**
 * UUID generator that works in non-secure contexts too. `crypto.randomUUID()`
 * is only available over HTTPS/localhost; on plain HTTP it throws, so we fall
 * back to a Math.random-based v4 (fine for guest tokens / idempotency keys).
 */
export function safeUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* not a secure context — fall through */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
