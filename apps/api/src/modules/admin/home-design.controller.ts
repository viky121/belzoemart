import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { createZodDto } from '../identity/zod-dto';
import { HomeDesignService, homeDesignInputSchema, type HomeDesign } from './home-design.service';

class HomeDesignDto extends createZodDto(homeDesignInputSchema) {}

/**
 * Home page design for the Marketing team: the order of the website home sections and the
 * content of the sections an admin can add (product rails, offer banners, banner/card blocks,
 * promo tiles, "why choose us"). Marketing (and super admin) only.
 */
@ApiTags('admin-home-design')
@ApiBearerAuth()
@RequirePermission('mobile.edit')
@Controller('admin/home-design')
export class HomeDesignController {
  constructor(private readonly design: HomeDesignService) {}

  @Get()
  get(): Promise<HomeDesign> {
    return this.design.get();
  }

  @Put()
  put(@CurrentUser() user: JwtPrincipal, @Body() dto: HomeDesignDto): Promise<HomeDesign> {
    return this.design.put(user.sub, dto);
  }
}
