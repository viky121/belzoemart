import {
  adminJobsQuerySchema,
  adminPartnersQuerySchema,
  assignJobSchema,
  changeContactSchema,
  createPartnerSchema,
  createZoneSchema,
  deliveryReasonBodySchema,
  deliverySettingsPatchSchema,
  failJobSchema,
  moveWithLocationSchema,
  partnerChangePasswordSchema,
  partnerHeartbeatSchema,
  partnerJobsQuerySchema,
  partnerLoginSchema,
  partnerOnlineSchema,
  partnerZonesSchema,
  reassignJobSchema,
  resetPartnerPasswordSchema,
  setPartnerActiveSchema,
  updatePartnerSchema,
  updateZoneSchema,
  verifyOtpSchema,
  zonePincodesSchema,
} from '@belzo/shared';
import { createZodDto } from '../identity/zod-dto';

/** Request DTOs of the delivery API. Each wraps a shared zod schema (SECURITY-05). */
export class PartnerLoginDto extends createZodDto(partnerLoginSchema) {}
export class PartnerChangePasswordDto extends createZodDto(partnerChangePasswordSchema) {}
export class PartnerOnlineDto extends createZodDto(partnerOnlineSchema) {}
export class PartnerHeartbeatDto extends createZodDto(partnerHeartbeatSchema) {}
export class PartnerJobsQueryDto extends createZodDto(partnerJobsQuerySchema) {}
export class MoveWithLocationDto extends createZodDto(moveWithLocationSchema) {}
export class FailJobDto extends createZodDto(failJobSchema) {}
export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}
export class ReasonDto extends createZodDto(deliveryReasonBodySchema) {}

export class CreatePartnerDto extends createZodDto(createPartnerSchema) {}
export class UpdatePartnerDto extends createZodDto(updatePartnerSchema) {}
export class SetPartnerActiveDto extends createZodDto(setPartnerActiveSchema) {}
export class ResetPartnerPasswordDto extends createZodDto(resetPartnerPasswordSchema) {}
export class AdminPartnersQueryDto extends createZodDto(adminPartnersQuerySchema) {}
export class CreateZoneDto extends createZodDto(createZoneSchema) {}
export class UpdateZoneDto extends createZodDto(updateZoneSchema) {}
export class ZonePincodesDto extends createZodDto(zonePincodesSchema) {}
export class PartnerZonesDto extends createZodDto(partnerZonesSchema) {}

export class AssignJobDto extends createZodDto(assignJobSchema) {}
export class ReassignJobDto extends createZodDto(reassignJobSchema) {}
export class ChangeContactDto extends createZodDto(changeContactSchema) {}
export class AdminJobsQueryDto extends createZodDto(adminJobsQuerySchema) {}
export class DeliverySettingsPatchDto extends createZodDto(deliverySettingsPatchSchema) {}
