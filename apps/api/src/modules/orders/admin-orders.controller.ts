import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ORDER_STATUSES } from '@belzo/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { createZodDto } from '../identity/zod-dto';
import { AuditLogService } from '../admin/audit-log.service';
import { OrderService } from './order.service';
import { FulfilmentService } from './fulfilment.service';
import { InvoiceService } from './invoice.service';
import { ReturnService } from './return.service';

const transitionSchema = z.object({ status: z.enum(ORDER_STATUSES) });
class TransitionDto extends createZodDto(transitionSchema) {}

const cancelSchema = z.object({ reason: z.string().trim().min(1).max(300) });
class AdminCancelDto extends createZodDto(cancelSchema) {}

const returnUpdateSchema = z.object({ status: z.enum(['approved', 'picked', 'received', 'rejected']) });
class ReturnUpdateDto extends createZodDto(returnUpdateSchema) {}

/**
 * Admin order & fulfilment management (FR-9). Guarded by RBAC (order_manager
 * or super_admin). Server-side authorization (SECURITY-08).
 */
@ApiTags('admin-orders')
@ApiBearerAuth()
@Roles('order_manager')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrderService,
    private readonly fulfilment: FulfilmentService,
    private readonly returns: ReturnService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('q') q?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orders.adminList({
      status: status as never,
      q,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() dto: TransitionDto) {
    return this.orders.transition(id, dto.status);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: AdminCancelDto) {
    return this.orders.cancel(id, { isAdmin: true }, dto.reason);
  }

  @Post(':id/shipment')
  createShipment(@Param('id') id: string) {
    return this.fulfilment.createShipment(id);
  }

  /**
   * Re-render the order's invoice with the current template/store details,
   * keeping the same invoice number and storage key (generates one if absent).
   */
  @Post(':id/invoice/regenerate')
  async regenerateInvoice(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    const res = await this.invoices.regenerate(id);
    await this.audit.record(user.sub, 'invoice.regenerate', id, undefined, res);
    return res;
  }

  @Post('shipments/:shipmentId/sync')
  async syncTracking(@Param('shipmentId') shipmentId: string) {
    await this.fulfilment.syncTracking(shipmentId);
    return { success: true };
  }

  @Get('returns')
  listReturns() {
    return this.returns.adminList();
  }

  @Patch('returns/:returnId')
  updateReturn(@Param('returnId') returnId: string, @Body() dto: ReturnUpdateDto) {
    return this.returns.adminUpdate(returnId, dto.status);
  }

  /**
   * Full order detail for the admin panel. Declared last so static routes
   * (e.g. `returns`) are matched before this `:id` param route.
   */
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.orders.adminGetOrder(id);
  }
}
