/** Client error model and user-facing messages (design §5.1, §9.1). */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'parse' | 'auth' | 'config';

export interface ApiErrorInit {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  message?: string;
  correlationId?: string;
  retryAfterSec?: number;
}

export class ApiError extends Error {
  kind: ApiErrorKind;
  /** 0 for non-HTTP kinds. */
  status: number;
  /** Envelope `error` (e.g. 'BadRequestException', 'ValidationError'), or the kind. */
  code: string;
  correlationId?: string;
  /** From the Retry-After header on 429. */
  retryAfterSec?: number;

  constructor(init: ApiErrorInit) {
    super(init.message ?? init.code ?? init.kind);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? 0;
    this.code = init.code ?? init.kind;
    this.correlationId = init.correlationId;
    this.retryAfterSec = init.retryAfterSec;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** What React Native and browsers say when a request could not be made. */
const NETWORK_FAILURE = /network request failed|failed to fetch|load failed|network error|internet|offline|timed out/i;

/** Normalises anything thrown into an ApiError. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  // Only a failed request is "offline". A TypeError from our own code (a missing function, an undefined value)
  // must not be shown to the customer as a network problem; it falls through to the generic message below.
  if (e instanceof TypeError && NETWORK_FAILURE.test(e.message)) return new ApiError({ kind: 'network', message: e.message });
  if (e instanceof Error) return new ApiError({ kind: 'parse', message: e.message });
  return new ApiError({ kind: 'parse', message: String(e) });
}

export const MESSAGES = {
  offline: "You're offline. Check your connection and try again.",
  timeout: 'The server is taking too long. Please try again.',
  server: 'Something went wrong on our side. Please try again.',
  validation: 'Please check the details and try again.',
  generic: 'Something went wrong. Please try again.',
  serverTooOld: 'This app needs a newer server version. Please try again later.',
  sessionExpired: 'Your session has expired. Please sign in again.',
} as const;

/** Maps an error to the message shown to the user (design §9.1). Empty string = show nothing. */
export function userMessage(e: unknown): string {
  const err = toApiError(e);
  switch (err.kind) {
    case 'network':
      return MESSAGES.offline;
    case 'timeout':
      return MESSAGES.timeout;
    case 'aborted':
    case 'auth':
      return '';
    case 'config':
      return err.code === 'ServerTooOld' ? MESSAGES.serverTooOld : MESSAGES.generic;
    case 'parse':
      return MESSAGES.generic;
    case 'http': {
      if (err.status >= 500) {
        const ref = err.correlationId ? ` Ref: ${err.correlationId.slice(0, 8)}` : '';
        return `${MESSAGES.server}${ref}`;
      }
      if (err.status === 429 && err.retryAfterSec !== undefined) {
        return `Too many attempts. Try again in ${err.retryAfterSec} s.`;
      }
      if (err.status === 400 && err.code === 'ValidationError') return MESSAGES.validation;
      return err.message && err.message !== err.code ? err.message : MESSAGES.generic;
    }
  }
}

/** Parses the server's "path: msg; path2: msg2" ValidationError message into field errors. */
export function fieldErrorsFrom(e: ApiError): Record<string, string> {
  const out: Record<string, string> = {};
  if (e.kind !== 'http' || !e.message) return out;
  for (const segment of e.message.split(';')) {
    const idx = segment.indexOf(':');
    if (idx <= 0) continue;
    const field = segment.slice(0, idx).trim();
    const msg = segment.slice(idx + 1).trim();
    if (field && msg && !(field in out)) out[field] = msg;
  }
  return out;
}
