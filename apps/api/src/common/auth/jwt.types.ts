import type { AdminRole } from '@belzo/shared';

/** Principal kind distinguishes customers from admin users. */
export type PrincipalKind = 'customer' | 'admin' | 'partner';

/** Decoded JWT access-token payload attached to the request as `req.user`. */
export interface JwtPrincipal {
  sub: string; // user id
  kind: PrincipalKind;
  roles: AdminRole[]; // empty for customers
}

declare module 'express' {
  interface Request {
    user?: JwtPrincipal;
  }
}
