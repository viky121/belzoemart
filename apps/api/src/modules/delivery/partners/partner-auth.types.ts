/** What the partner access token carries. It is signed with JWT_PARTNER_SECRET, never the customer or admin secret. */
export interface PartnerTokenClaims {
  sub: string;
  kind: 'partner';
  /** Must change password. Informational only: the guard reads the live value from the database. */
  mcp: boolean;
}

/** The partner behind the current request, loaded from the database by PartnerAuthGuard. */
export interface AuthenticatedPartner {
  id: string;
  name: string;
  mobile: string;
  mustChangePassword: boolean;
  isOnline: boolean;
}

declare module 'express' {
  interface Request {
    partner?: AuthenticatedPartner;
  }
}

export interface PartnerIssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
