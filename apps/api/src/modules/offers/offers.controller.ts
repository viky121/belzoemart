import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { Public } from '../../common/auth/public.decorator';
import { createZodDto } from '../identity/zod-dto';
import { OffersService, type OfferInput } from './offers.service';

const date = z
  .union([z.string().datetime({ offset: true }), z.null()])
  .transform((v) => (v ? new Date(v) : null));

const offerBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Paise. */
  minSpend: z.number().int().min(100).max(10_000_000),
  variantId: z.string().uuid(),
  /** Paise. */
  specialPrice: z.number().int().min(100).max(10_000_000),
  units: z.number().int().min(1).max(10),
  isActive: z.boolean(),
  startsAt: date,
  endsAt: date,
});
class CreateOfferDto extends createZodDto(offerBodySchema) {}
class UpdateOfferDto extends createZodDto(offerBodySchema.partial().strict()) {}

/** Storefront: the offers that are on now (the product page shows "Shop X and get this at Y"). */
@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Public()
  @Get('active')
  active() {
    return this.offers.publicActive();
  }
}

/** Admin: manage special-price offers. */
@ApiTags('admin-offers')
@ApiBearerAuth()
@Controller('admin/offers')
export class AdminOffersController {
  constructor(private readonly offers: OffersService) {}

  @RequirePermission('offers.view')
  @Get()
  list() {
    return this.offers.list();
  }

  /** Search packs (products and sizes) to pick for an offer. */
  @RequirePermission('offers.edit')
  @Get('packs')
  packs(@Query('search') search?: string) {
    return this.offers.searchPacks(search ?? '');
  }

  @RequirePermission('offers.edit')
  @Post()
  create(@CurrentUser() user: JwtPrincipal, @Body() dto: CreateOfferDto) {
    return this.offers.create(user.sub, dto as OfferInput);
  }

  @RequirePermission('offers.edit')
  @Patch(':id')
  update(@CurrentUser() user: JwtPrincipal, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.offers.update(user.sub, id, dto as Partial<OfferInput>);
  }

  @RequirePermission('offers.edit')
  @Delete(':id')
  async remove(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    await this.offers.remove(user.sub, id);
    return { success: true };
  }
}
