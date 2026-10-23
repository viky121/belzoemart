import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface SocialProfile {
  email: string;
  name: string;
  providerId: string;
}

/**
 * Social login verification (BR/FR-1.2). In Phase 1 this verifies Google ID
 * tokens. In development (no client configured) it accepts a base64url-encoded
 * JSON stub so the flow is exercisable without external calls. A real
 * verification (google-auth-library) is wired when credentials are supplied.
 */
@Injectable()
export class SocialAuthService {
  async verifyGoogle(idToken: string): Promise<SocialProfile> {
    // Development stub: idToken is base64url(JSON({email,name,sub})).
    if (process.env.NODE_ENV !== 'production') {
      try {
        const json = Buffer.from(idToken, 'base64url').toString('utf8');
        const parsed = JSON.parse(json) as { email?: string; name?: string; sub?: string };
        if (parsed.email && parsed.sub) {
          return { email: parsed.email, name: parsed.name ?? parsed.email, providerId: parsed.sub };
        }
      } catch {
        // fall through to error
      }
      throw new UnauthorizedException('Invalid Google token (dev stub expects base64url JSON)');
    }
    // Production: real verification is added with the Google client at deploy.
    throw new UnauthorizedException('Google login not configured');
  }
}
