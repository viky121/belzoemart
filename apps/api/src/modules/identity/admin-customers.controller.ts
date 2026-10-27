import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../common/auth/permissions.decorator';
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
@RequirePermission('customers.view')
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

  @RequirePermission('customers.block')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: CustomerStatusDto) {
    return this.customers.setStatus(id, dto.status);
  }
}
