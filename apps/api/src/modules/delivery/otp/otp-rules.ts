import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { DeliverySettings } from '@belzo/shared';

/**
 * Pure rules of the delivery OTP (BR-D31 to BR-D38, SP4). No database, no clock of its own: the
 * caller passes `now`, so the rules are easy to test and cannot drift from the service.
 */

/** 6 random digits from a cryptographically strong source. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** HMAC-SHA256 of `jobId:attemptNo:code` with the server pepper (hex). The code itself is never stored. */
export function hashOtp(pepper: string, jobId: string, attemptNo: number, code: string): string {
  return createHmac('sha256', pepper).update(`${jobId}:${attemptNo}:${code}`).digest('hex');
}

/** Constant-time comparison of the hash of `code` with the stored hash. */
export function otpMatches(pepper: string, jobId: string, attemptNo: number, code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOtp(pepper, jobId, attemptNo, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface OtpState {
  codeHash: string;
  wrongGuesses: number;
  expiresAt: Date;
  attemptNo: number;
}

export type VerifyDecision =
  | { kind: 'job_locked'; retryAfterSeconds: number }
  | { kind: 'expired' }
  | { kind: 'verified' }
  | { kind: 'wrong'; wrongGuesses: number; attemptsLeft: number; lock: boolean };

const secondsUntil = (to: Date, now: Date): number => Math.max(1, Math.ceil((to.getTime() - now.getTime()) / 1000));

/**
 * Decide what a verify attempt does (BR-D35 to BR-D37). While the job is locked the code is not
 * even compared, so a locked job leaks nothing. `otp` is the active OTP of the job, or null.
 */
export function checkOtp(input: {
  otp: OtpState | null;
  jobId: string;
  lockedUntil: Date | null;
  now: Date;
  settings: Pick<DeliverySettings, 'otpMaxWrongGuesses'>;
  pepper: string;
  code: string;
}): VerifyDecision {
  const { otp, lockedUntil, now, settings } = input;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    return { kind: 'job_locked', retryAfterSeconds: secondsUntil(lockedUntil, now) };
  }
  if (!otp || otp.expiresAt.getTime() <= now.getTime()) return { kind: 'expired' };
  if (otpMatches(input.pepper, input.jobId, otp.attemptNo, input.code, otp.codeHash)) return { kind: 'verified' };
  const wrongGuesses = otp.wrongGuesses + 1;
  return {
    kind: 'wrong',
    wrongGuesses,
    attemptsLeft: Math.max(0, settings.otpMaxWrongGuesses - wrongGuesses),
    lock: wrongGuesses >= settings.otpMaxWrongGuesses,
  };
}

export type ResendDecision =
  | { ok: true }
  | { ok: false; reason: 'locked'; retryAfterSeconds: number }
  | { ok: false; reason: 'cooldown'; retryAfterSeconds: number }
  | { ok: false; reason: 'limit' };

/** Decide whether a resend is allowed (BR-D34): not locked, not too soon, and within the send budget. */
export function decideResend(input: {
  now: Date;
  lockedUntil: Date | null;
  lastSentAt: Date | null;
  sendCount: number;
  settings: Pick<DeliverySettings, 'otpResendSeconds' | 'otpMaxSends'>;
}): ResendDecision {
  const { now, lockedUntil, lastSentAt, sendCount, settings } = input;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: 'locked', retryAfterSeconds: secondsUntil(lockedUntil, now) };
  }
  if (sendCount >= settings.otpMaxSends) return { ok: false, reason: 'limit' };
  if (lastSentAt) {
    const allowedAt = new Date(lastSentAt.getTime() + settings.otpResendSeconds * 1000);
    if (allowedAt.getTime() > now.getTime()) return { ok: false, reason: 'cooldown', retryAfterSeconds: secondsUntil(allowedAt, now) };
  }
  return { ok: true };
}

/** A verified OTP is good enough to deliver only for a limited time afterwards (BR-D38). */
export function isVerificationFresh(verifiedAt: Date | null, now: Date, settings: Pick<DeliverySettings, 'otpVerifiedFreshMinutes'>): boolean {
  if (!verifiedAt) return false;
  return now.getTime() - verifiedAt.getTime() <= settings.otpVerifiedFreshMinutes * 60_000;
}
