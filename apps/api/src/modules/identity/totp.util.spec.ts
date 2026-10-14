import { createHmac } from 'node:crypto';
import { verifyTotp } from './totp.util';

/**
 * Verifies TOTP acceptance/rejection. We recompute the expected code with the
 * same algorithm to drive a positive case, and assert a wrong code fails.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const c of input) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function currentCode(secret: string, step = 30): string {
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

describe('verifyTotp (BR-7)', () => {
  const secret = 'JBSWY3DPEHPK3PXP';

  it('accepts the current valid code', () => {
    expect(verifyTotp(secret, currentCode(secret))).toBe(true);
  });

  it('rejects an obviously wrong code', () => {
    const wrong = currentCode(secret) === '000000' ? '111111' : '000000';
    expect(verifyTotp(secret, wrong)).toBe(false);
  });
});
