import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PickupInfo } from '@belzo/shared';
import { Public } from '../../common/auth/public.decorator';
import { PickupService } from './pickup.service';

/**
 * Self pickup information for the checkout and the order pages: whether pickup is on, the timings note,
 * the shop address and the day/time slots on offer right now. Public: it holds the same shop details
 * that are printed on every invoice, and nothing about any customer.
 */
@ApiTags('checkout')
@Controller('checkout')
export class PickupController {
  constructor(private readonly pickup: PickupService) {}

  @Public()
  @Get('pickup')
  info(): Promise<PickupInfo> {
    return this.pickup.info();
  }
}
