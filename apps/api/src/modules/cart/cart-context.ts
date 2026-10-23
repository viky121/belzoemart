import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { TokenService } from '../identity/token.service';
import type { CartRef } from './cart.service';

/**
 * Resolves a CartRef for a request. Cart endpoints are public (guests can have
 * carts), so we decode the bearer access token manually when present, otherwise
 * fall back to an `x-guest-token` header the client generates and persists.
 */
export async function resolveCartRef(req: Request, tokens: TokenService): Promise<CartRef> {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const principal = await tokens.verifyAccess(auth.slice(7));
      if (principal.kind === 'customer') return { customerId: principal.sub };
    } catch {
      // fall through to guest handling
    }
  }
  const guestToken = req.headers['x-guest-token'];
  if (typeof guestToken === 'string' && guestToken.length >= 8) {
    return { guestToken };
  }
  throw new BadRequestException('Provide a bearer token or an x-guest-token header');
}
