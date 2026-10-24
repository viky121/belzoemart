import { HttpException } from '@nestjs/common';

/**
 * Business error codes of the delivery API. The body is `{ statusCode, code, message, ...extra }`
 * with plain text for the user and a stable `code` for the apps (SECURITY-15: no internals).
 */
export const DELIVERY_ERROR_CODES = [
  'NOT_FOUND',
  'FORBIDDEN',
  'INVALID_TRANSITION',
  'ORDER_CANCELLED',
  'MAX_ATTEMPTS_REACHED',
  'OTP_NOT_VERIFIED',
  'OTP_STALE',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_LOCKED',
  'OTP_RESEND_TOO_SOON',
  'OTP_SEND_LIMIT',
  'ORDER_NOT_ASSIGNABLE',
  'JOB_ALREADY_ACTIVE',
  'PARTNER_UNAVAILABLE',
  'PARTNER_AT_CAPACITY',
  'ADDRESS_INCOMPLETE',
  'GUARD_REFUSED',
  'GATE_REFUSED',
  'INVALID_INPUT',
] as const;
export type DeliveryErrorCode = (typeof DELIVERY_ERROR_CODES)[number];

export class DeliveryError extends HttpException {
  constructor(
    status: number,
    readonly code: DeliveryErrorCode,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super({ statusCode: status, code, message, ...extra }, status);
  }
}

/** A refusal decided by pure rules, turned into a DeliveryError by the service layer. */
export interface RuleFailure {
  ok: false;
  status: number;
  code: DeliveryErrorCode;
  message: string;
  extra?: Record<string, unknown>;
}

export function fail(status: number, code: DeliveryErrorCode, message: string, extra?: Record<string, unknown>): RuleFailure {
  return { ok: false, status, code, message, ...(extra ? { extra } : {}) };
}

export function toDeliveryError(f: RuleFailure): DeliveryError {
  return new DeliveryError(f.status, f.code, f.message, f.extra);
}
