const PREFIX = 'data:application/json;base64,';

/**
 * Decode a DPDP export data-URL (design §11). The server base64-encodes UTF-8 bytes, so a bare
 * `atob` (Latin-1) would garble Devanagari and "₹"; we percent-decode the bytes as UTF-8.
 */
export function decodeExport(resultUrl: string): { ok: true; json: string } | { ok: false } {
  if (!resultUrl.startsWith(PREFIX)) return { ok: false };
  try {
    const bin = atob(resultUrl.slice(PREFIX.length));
    const json = decodeURIComponent(
      Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
    );
    return { ok: true, json };
  } catch {
    return { ok: false }; // invalid base64 (atob throws) or invalid UTF-8 (URIError)
  }
}
