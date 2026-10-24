import { decodeExport } from '../export-decode';

const PREFIX = 'data:application/json;base64,';

/** base64 of the string's UTF-8 bytes, without Node's Buffer. */
function toBase64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

describe('decodeExport', () => {
  it('round-trips UTF-8 content (Devanagari and ₹)', () => {
    const original = '{"name":"राम ₹"}';
    const url = PREFIX + toBase64Utf8(original);
    const result = decodeExport(url);
    expect(result).toEqual({ ok: true, json: original });
  });

  it('rejects a non-matching prefix', () => {
    expect(decodeExport('https://example.com/export.json')).toEqual({ ok: false });
    expect(decodeExport('data:text/plain;base64,aGk=')).toEqual({ ok: false });
  });

  it('rejects invalid base64', () => {
    expect(decodeExport(PREFIX + '!!!not base64!!!')).toEqual({ ok: false });
  });
});
