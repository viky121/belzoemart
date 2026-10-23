import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long a verified mobile/email stays valid while the customer finishes the form. */
export const PROOF_TTL_MS = 15 * 60 * 1000;

export type ProofKind = 'phone' | 'email';

interface ProofPayload {
  /** What was verified. */
  k: ProofKind;
  /** The verified value: 10-digit mobile or lower-case email. */
  v: string;
  /** Expiry, epoch ms. */
  exp: number;
}

function secret(): string {
  const s = process.env.JWT_ACCESS_SECRET || process.env.JWT_REFRESH_SECRET || '';
  if (!s) throw new Error('No server secret available to sign verification proofs');
  return `otp-proof:${s}`;
}

const sign = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url');

/**
 * A short-lived, signed receipt that a mobile number or email was verified by OTP.
 * The customer hands it back when creating an account or resetting a password, so those
 * calls never have to trust a client that merely says "I verified it".
 */
export function signProof(kind: ProofKind, value: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ k: kind, v: value, exp: now + PROOF_TTL_MS } satisfies ProofPayload)).toString(
    'base64url',
  );
  return `${body}.${sign(body)}`;
}

/** Returns the verified kind + value, or throws 400 when the proof is forged, malformed or expired. */
export function readProof(proof: string, now = Date.now()): { kind: ProofKind; value: string } {
  const bad = () =>
    new BadRequestException('Your verification expired or is invalid. Please verify your mobile number and email again.');
  const [body, sig] = proof.split('.');
  if (!body || !sig) throw bad();
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw bad();
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ProofPayload;
    if ((p.k !== 'phone' && p.k !== 'email') || typeof p.v !== 'string' || typeof p.exp !== 'number') throw bad();
    if (p.exp < now) throw bad();
    return { kind: p.k, value: p.v };
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw bad();
  }
}

/** Throws unless `proof` shows exactly this `kind` + `value` was verified. */
export function requireProof(proof: string, kind: ProofKind, value: string): void {
  const p = readProof(proof);
  if (p.kind !== kind || p.value !== value) {
    throw new BadRequestException(
      kind === 'phone'
        ? 'Verify the mobile number you entered with an OTP.'
        : 'Verify the email you entered with an OTP.',
    );
  }
}
