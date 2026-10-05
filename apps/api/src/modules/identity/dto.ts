import { createZodDto } from './zod-dto';
import {
  addressInputSchema,
  adminLoginSchema,
  emailLoginSchema,
  emailRegisterSchema,
  otpRequestSchema,
  otpVerifySchema,
} from '@belzo/shared';
import { z } from 'zod';

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

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  // Customers created via mobile OTP have no email (and vice-versa); the
  // profile-completion flow lets them add the missing contact. Uniqueness is
  // enforced server-side in ProfileService.update.
  email: z.string().trim().email('Enter a valid email address').max(190).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+?91)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .optional(),
  gender: z.string().trim().max(20).optional(),
  dob: z.string().datetime().optional(),
  photoUrl: z.string().url().optional(),
  locale: z.enum(['en', 'hi']).optional(),
});
export class ProfilePatchDto extends createZodDto(profilePatchSchema) {}
