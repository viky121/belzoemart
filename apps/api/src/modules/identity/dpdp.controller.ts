import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { DataRequestService } from './data-request.service';

/**
 * DPDP data-rights endpoints (FR-1.7, NFR-2.2): a customer may request an
 * export or deletion of their personal data, and check status.
 */
@ApiTags('dpdp')
@ApiBearerAuth()
@Controller('me/data')
export class DpdpController {
  constructor(private readonly dataRequests: DataRequestService) {}

  @Post('export')
  requestExport(@CurrentUser() user: JwtPrincipal) {
    return this.dataRequests.requestExport(user.sub);
  }

  @Post('deletion')
  requestDeletion(@CurrentUser() user: JwtPrincipal) {
    return this.dataRequests.requestDeletion(user.sub);
  }

  @Get('requests')
  status(@CurrentUser() user: JwtPrincipal) {
    return this.dataRequests.status(user.sub);
  }
}
