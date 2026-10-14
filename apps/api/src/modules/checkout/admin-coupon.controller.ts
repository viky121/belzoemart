import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../../common/auth/roles.decorator';
import { createZodDto } from '../identity/zod-dto';
import { CouponService } from './coupon.service';

const couponCreateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  kind: z.enum(['flat', 'percent', 'free_shipping']),
  value: z.number().int().min(0),
  minOrder: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().min(0).nullable().optional(),
  perUserLimit: z.number().int().min(0).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});
class CouponCreateDto extends createZodDto(couponCreateSchema) {}

const couponUpdateSchema = couponCreateSchema.partial();
class CouponUpdateDto extends createZodDto(couponUpdateSchema) {}

/**
 * Admin coupon / offer management (FR-10). Marketing role only (server-side
 * RBAC, SECURITY-08). Coupons are evaluated at checkout by CouponService.
 */
@ApiTags('admin-coupons')
@ApiBearerAuth()
@Roles('marketing')
@Controller('admin/coupons')
export class AdminCouponController {
  constructor(private readonly coupons: CouponService) {}

  @Get()
  list() {
    return this.coupons.adminList();
  }

  @Post()
  create(@Body() dto: CouponCreateDto) {
    return this.coupons.adminCreate(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CouponUpdateDto) {
    return this.coupons.adminUpdate(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.coupons.adminRemove(id);
  }
}
