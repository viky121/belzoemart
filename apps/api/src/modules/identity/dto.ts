import { createZodDto } from './zod-dto';
import {
  addressInputSchema,
  adminLoginSchema,
  emailLoginSchema,
  emailRegisterSchema,
  otpRequestSchema,
  otpVerifySchema,
  profilePatchSchema,
} from '@belzo/shared';
import { z } from 'zod';

export { profilePatchSchema };

/**
 * Request DTOs for identity endpoints. Each wraps a shared zod schema so
 * validation is identical on client and server (SECURITY-05).
 */
export class OtpRequestDto extends createZodDto(otpRequestSchema) {}
export class OtpVerifyDto extends createZodDto(otpVerifySchema) {}
export class EmailRegisterDto extends createZodDto(emailRegisterSchema) {}
export class EmailLoginDto extends createZodDto(emailLoginSchema) {}
export class AdminLoginDto extends createZodDto(adminLoginSchema) {}
export class AddressDto extends createZodDto(addressInputSchema) {}

export const googleLoginSchema = z.object({ idToken: z.string().min(1) });
export class GoogleLoginDto extends createZodDto(googleLoginSchema) {}

export class ProfilePatchDto extends createZodDto(profilePatchSchema) {}
