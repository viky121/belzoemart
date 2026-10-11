import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { MAX_RETURN_IMAGES, RETURN_REASON_CODES } from '@belzo/shared';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { createZodDto } from '../identity/zod-dto';
import { OrderService } from './order.service';
import { InvoiceService } from './invoice.service';
import { ReturnService } from './return.service';

const cancelSchema = z.object({ reason: z.string().trim().min(1).max(300) });
class CancelDto extends createZodDto(cancelSchema) {}

const returnSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(1).max(300),
  reasonCode: z.enum(RETURN_REASON_CODES).optional(),
  // Not .url(): local storage URLs are relative when PUBLIC_BASE_URL is unset.
  // ReturnService accepts only URLs produced by the return-photo upload.
  images: z.array(z.string().trim().min(1).max(1000)).max(MAX_RETURN_IMAGES).optional(),
  resolution: z.enum(['refund_source', 'refund_wallet', 'replace']).optional(),
  items: z
    .array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(1).max(1000) }))
    .min(1)
    .max(100)
    .optional(),
});
class ReturnDto extends createZodDto(returnSchema) {}

/**
 * Customer order endpoints (FR-5). All scoped to the authenticated customer
 * (ownership enforced in the service — IDOR-safe).
 */
@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrderService,
    private readonly invoices: InvoiceService,
    private readonly returns: ReturnService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPrincipal) {
    return this.orders.listForCustomer(user.sub);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    return this.orders.getForCustomer(user.sub, id);
  }

  /** Tracking reconciled with the order status (ownership checked by getForCustomer). */
  @Get(':id/tracking')
  async tracking(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    return (await this.orders.getForCustomer(user.sub, id)).tracking;
  }

  @Get(':id/invoice')
  async invoice(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    await this.orders.getForCustomer(user.sub, id);
    return this.invoices.generate(id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtPrincipal, @Param('id') id: string, @Body() dto: CancelDto) {
    return this.orders.cancel(id, { customerId: user.sub }, dto.reason);
  }

  @Post(':id/reorder')
  reorder(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    return this.orders.reorder(user.sub, id);
  }

  @Post('returns')
  requestReturn(@CurrentUser() user: JwtPrincipal, @Body() dto: ReturnDto) {
    return this.returns.request(user.sub, dto);
  }

  @Get('returns/mine')
  myReturns(@CurrentUser() user: JwtPrincipal) {
    return this.returns.listForCustomer(user.sub);
  }
}
