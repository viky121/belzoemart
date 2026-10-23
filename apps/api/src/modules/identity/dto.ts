import { createZodDto } from './zod-dto';
import {
  addressInputSchema,
  adminLoginSchema,
  emailLoginSchema,
  identifierLoginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordResetSchema,
  phoneLoginSchema,
  profilePatchSchema,
  registerAccountSchema,
} from '@belzo/shared';
import { z } from 'zod';

export { profilePatchSchema };

/**
 * Request DTOs for identity endpoints. Each wraps a shared zod schema so
 * validation is identical on client and server (SECURITY-05).
 */
export class OtpRequestDto extends createZodDto(otpRequestSchema) {}
export class OtpVerifyDto extends createZodDto(otpVerifySchema) {}
export class RegisterAccountDto extends createZodDto(registerAccountSchema) {}
export class PhoneLoginDto extends createZodDto(phoneLoginSchema) {}
export class IdentifierLoginDto extends createZodDto(identifierLoginSchema) {}
export class PasswordResetDto extends createZodDto(passwordResetSchema) {}
export class EmailLoginDto extends createZodDto(emailLoginSchema) {}
export class AdminLoginDto extends createZodDto(adminLoginSchema) {}
export class AddressDto extends createZodDto(addressInputSchema) {}

export const googleLoginSchema = z.object({ idToken: z.string().min(1) });
export class GoogleLoginDto extends createZodDto(googleLoginSchema) {}

export class ProfilePatchDto extends createZodDto(profilePatchSchema) {}
