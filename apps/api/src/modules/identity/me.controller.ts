import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { ProfileService } from './profile.service';
import { ProfilePatchDto } from './dto';

/**
 * Authenticated customer profile (FR-1.4). Scoped to the caller's own id via
 * the JWT principal — no id is accepted from the client (IDOR-safe, BR-10).
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: JwtPrincipal) {
    return this.profile.get(user.sub);
  }

  @Patch()
  update(@CurrentUser() user: JwtPrincipal, @Body() dto: ProfilePatchDto) {
    return this.profile.update(user.sub, dto);
  }
}
