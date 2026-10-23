import { SetMetadata } from '@nestjs/common';

/** Marks a route as public (bypasses JwtAuthGuard). Deny-by-default otherwise. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
