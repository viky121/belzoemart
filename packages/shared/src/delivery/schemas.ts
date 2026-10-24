import { z } from 'zod';
import { MAX_PAGE_SIZE } from '../constants';
import { emailSchema, uuidSchema } from '../schemas';
import { DELIVERY_ATTENTION_REASONS, DELIVERY_STATUSES, FAIL_REASON_CODES } from './status';
import { hasControlChars, isValidPincode, normalizeMobile } from './format';
import { containsMobile, deliveryPasswordSchema } from './password-denylist';

/**
 * Request schemas for the delivery API, shared by the API (runtime validation) and the web app
 * (forms). Every string has a length limit and an allow-list format (SECURITY-05).
 */

const noControl = (s: string) => !hasControlChars(s);

/** A 10-digit Indian mobile; accepts +91, spaces and dashes and returns the clean 10 digits. */
export const deliveryMobileSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => normalizeMobile(v) !== null, 'Enter a valid 10-digit Indian mobile number')
  .transform((v) => normalizeMobile(v) as string);

/** Reason or note: 3 to 255 characters, trimmed, no control characters (BR-D25). */
export const deliveryReasonSchema = z
  .string()
  .trim()
  .min(3, 'Please give a reason (at least 3 characters)')
  .max(255)
  .refine(noControl, 'Contains invalid characters');
export const deliveryReasonBodySchema = z.object({ reason: deliveryReasonSchema }).strict();
export type DeliveryReasonBody = z.infer<typeof deliveryReasonBodySchema>;

const shortText = (max: number) => z.string().trim().max(max).refine(noControl, 'Contains invalid characters');

export const deliveryPincodeSchema = z.string().trim().refine(isValidPincode, 'Enter a valid 6-digit pincode');

/** Optional GPS point; both numbers or none (BR-D26). */
export const deliveryLocationSchema = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .strict();
export type DeliveryLocation = z.infer<typeof deliveryLocationSchema>;
const optionalLocation = { location: deliveryLocationSchema.optional() };

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

const partnerFields = {
  name: z.string().trim().min(2).max(80).refine(noControl, 'Contains invalid characters'),
  email: emailSchema.optional().nullable(),
  vehicleType: shortText(40).optional().nullable(),
  vehicleNumber: shortText(20).optional().nullable(),
  maxActiveJobs: z.number().int().min(1).max(100).optional(),
  zoneIds: z.array(uuidSchema).max(50).optional(),
};

export const createPartnerSchema = z
  .object({ ...partnerFields, mobile: deliveryMobileSchema, password: deliveryPasswordSchema })
  .strict()
  .superRefine((v, ctx) => {
    if (containsMobile(v.password, v.mobile)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password must not contain the mobile number' });
    }
  });
export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;

export const updatePartnerSchema = z.object(partnerFields).partial().strict();
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;

export const setPartnerActiveSchema = z.object({ active: z.boolean() }).strict();

export const resetPartnerPasswordSchema = z.object({ password: deliveryPasswordSchema }).strict();

export const partnerLoginSchema = z
  .object({ mobile: deliveryMobileSchema, password: z.string().min(1).max(128) })
  .strict();
export type PartnerLoginInput = z.infer<typeof partnerLoginSchema>;

export const partnerChangePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: deliveryPasswordSchema })
  .strict()
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'The new password must be different from the old one',
  });
export type PartnerChangePasswordInput = z.infer<typeof partnerChangePasswordSchema>;

export const partnerOnlineSchema = z.object({ online: z.boolean() }).strict();
export const partnerHeartbeatSchema = z.object({ location: deliveryLocationSchema.optional() }).strict();

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export const createZoneSchema = z
  .object({ name: z.string().trim().min(2).max(60).refine(noControl, 'Contains invalid characters'), isActive: z.boolean().optional() })
  .strict();
export const updateZoneSchema = createZoneSchema.partial().strict();
export const zonePincodesSchema = z.object({ pincodes: z.array(deliveryPincodeSchema).max(2000) }).strict();
export const partnerZonesSchema = z.object({ zoneIds: z.array(uuidSchema).max(50) }).strict();

// ---------------------------------------------------------------------------
// Jobs: admin commands
// ---------------------------------------------------------------------------

export const assignJobSchema = z.object({ partnerId: uuidSchema, note: shortText(255).optional() }).strict();
export type AssignJobInput = z.infer<typeof assignJobSchema>;

export const reassignJobSchema = z.object({ partnerId: uuidSchema, reason: deliveryReasonSchema }).strict();
export type ReassignJobInput = z.infer<typeof reassignJobSchema>;

export const changeContactSchema = z.object({ phone: deliveryMobileSchema }).strict();

// ---------------------------------------------------------------------------
// Jobs: partner commands
// ---------------------------------------------------------------------------

export const moveWithLocationSchema = z.object({ ...optionalLocation }).strict();

export const failJobSchema = z
  .object({
    reasonCode: z.enum(FAIL_REASON_CODES),
    note: shortText(255).optional(),
    ...optionalLocation,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.reasonCode === 'other' && (v.note ?? '').length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Please describe the reason (at least 3 characters)' });
    }
  });
export type FailJobInput = z.infer<typeof failJobSchema>;

export const verifyOtpSchema = z
  .object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') })
  .strict();
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const pageFields = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
};

export const adminJobsQuerySchema = z
  .object({
    status: z.enum(DELIVERY_STATUSES).optional(),
    partnerId: uuidSchema.optional(),
    attention: z.enum(DELIVERY_ATTENTION_REASONS).optional(),
    q: shortText(60).optional(),
    ...pageFields,
  })
  .strict();
export type AdminJobsQuery = z.infer<typeof adminJobsQuerySchema>;

export const partnerJobsQuerySchema = z
  .object({ scope: z.enum(['active', 'history']).default('active'), ...pageFields })
  .strict();
export type PartnerJobsQuery = z.infer<typeof partnerJobsQuerySchema>;

export const adminPartnersQuerySchema = z
  .object({
    q: shortText(60).optional(),
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    zoneId: uuidSchema.optional(),
    ...pageFields,
  })
  .strict();
export type AdminPartnersQuery = z.infer<typeof adminPartnersQuerySchema>;
