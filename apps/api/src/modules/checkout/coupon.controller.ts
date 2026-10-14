import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Money } from '@belzo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { createZodDto } from '../identity/zod-dto';
import { CouponService } from './coupon.service';

const validateCouponSchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotal: z.number().int().min(0),
});
class ValidateCouponDto extends createZodDto(validateCouponSchema) {}

/** Coupon validation for the checkout UI (FR-4.3). */
@ApiTags('coupons')
@ApiBearerAuth()
@Controller('coupons')
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  @Post('validate')
  validate(@CurrentUser() user: JwtPrincipal, @Body() dto: ValidateCouponDto) {
    return this.coupons.evaluate(dto.code, dto.subtotal as Money, user.sub);
  }
}
