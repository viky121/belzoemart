import { BadRequestException } from '@nestjs/common';
import { PROOF_TTL_MS, readProof, requireProof, signProof } from './otp-proof';

describe('otp proofs', () => {
  const prev = process.env.JWT_ACCESS_SECRET;
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
  });
  afterAll(() => {
    process.env.JWT_ACCESS_SECRET = prev;
  });

  it('round-trips a verified mobile number', () => {
    expect(readProof(signProof('phone', '9412807767'))).toEqual({ kind: 'phone', value: '9412807767' });
  });

  it('rejects a tampered value, a swapped signature and garbage', () => {
    const [body, sig] = signProof('phone', '9412807767').split('.');
    const forged = Buffer.from(JSON.stringify({ k: 'phone', v: '9999999999', exp: Date.now() + 1e6 })).toString('base64url');
    expect(() => readProof(`${forged}.${sig}`)).toThrow(BadRequestException);
    expect(() => readProof(`${body}.AAAA`)).toThrow(BadRequestException);
    expect(() => readProof('nonsense')).toThrow(BadRequestException);
  });

  it('expires after 15 minutes', () => {
    const t0 = Date.now();
    const proof = signProof('email', 'a@b.com', t0);
    expect(() => readProof(proof, t0 + PROOF_TTL_MS - 1000)).not.toThrow();
    expect(() => readProof(proof, t0 + PROOF_TTL_MS + 1000)).toThrow(/expired/);
  });

  it('requireProof checks both the kind and the exact value', () => {
    const proof = signProof('phone', '9412807767');
    expect(() => requireProof(proof, 'phone', '9412807767')).not.toThrow();
    expect(() => requireProof(proof, 'phone', '9000000000')).toThrow(/Verify the mobile number/);
    expect(() => requireProof(proof, 'email', '9412807767')).toThrow(/Verify the email/);
  });

  it('a proof signed with another secret is refused', () => {
    const proof = signProof('phone', '9412807767');
    process.env.JWT_ACCESS_SECRET = 'b'.repeat(40);
    expect(() => readProof(proof)).toThrow(BadRequestException);
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(40);
  });
});
