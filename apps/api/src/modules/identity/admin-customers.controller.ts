import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../../common/auth/roles.decorator';
import { createZodDto } from './zod-dto';
import { AdminCustomerService } from './admin-customer.service';

const statusSchema = z.object({ status: z.enum(['active', 'blocked']) });
class CustomerStatusDto extends createZodDto(statusSchema) {}

/**
 * Admin customer directory (FR-11). Readable by order/support/marketing roles;
 * block/unblock is a write. Server-side RBAC (SECURITY-08).
 */
@ApiTags('admin-customers')
@ApiBearerAuth()
@Roles('order_manager', 'marketing', 'support')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomerService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.customers.list({
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.customers.detail(id);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: CustomerStatusDto) {
    return this.customers.setStatus(id, dto.status);
  }
}
