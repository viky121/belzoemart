import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing (BR-2, SECURITY-12). Uses argon2id — an adaptive,
 * memory-hard algorithm. Plaintext passwords are never stored or logged.
 */
@Injectable()
export class PasswordService {
  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Malformed hash or verification error → treat as non-match (fail closed).
      return false;
    }
  }
}
