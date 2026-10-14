import { Body, Controller, Get, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { createZodDto } from '../identity/zod-dto';
import { ReportingService } from './reporting.service';
import { SettingsService } from './settings.service';
import { AuditLogService } from './audit-log.service';

const settingSchema = z.object({ key: z.string().trim().min(1).max(80), value: z.unknown() });
class SettingDto extends createZodDto(settingSchema) {}

const serviceabilitySchema = z.object({
  pincodes: z
    .array(z.string().trim().regex(/^[1-9]\d{5}$/, 'Each PIN must be 6 digits'))
    .max(10000),
});
class ServiceabilityDto extends createZodDto(serviceabilitySchema) {}

const SERVICEABLE_PINCODES_KEY = 'shipping.serviceablePincodes';

/**
 * Admin dashboard, reports, settings, and audit log (FR-7, FR-12, FR-13).
 * Guarded by RBAC. Report endpoints support `?format=csv` for download.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogService,
  ) {}

  @Roles('order_manager', 'marketing')
  @Get('dashboard')
  dashboard() {
    return this.reporting.dashboard();
  }

  @Roles('order_manager', 'marketing')
  @Get('reports/sales-trend')
  salesTrend(@Query('days') days?: string) {
    return this.reporting.salesTrend(days ? Number(days) : 7);
  }

  @Roles('order_manager', 'marketing')
  @Get('reports/sales')
  async sales(@Query('from') from?: string, @Query('to') to?: string, @Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const rows = await this.reporting.sales({ from, to });
    return this.maybeCsv(rows, ['status', 'orders', 'revenue'], 'sales', format, res);
  }

  @Roles('order_manager', 'marketing')
  @Get('reports/gst')
  gst(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reporting.gst({ from, to });
  }

  @Roles('order_manager', 'marketing')
  @Get('reports/inventory')
  async inventory(@Query('format') format?: string, @Res({ passthrough: true }) res?: Response) {
    const rows = await this.reporting.inventory();
    return this.maybeCsv(rows, ['sku', 'product', 'available', 'reserved', 'reorderLevel'], 'inventory', format, res);
  }

  @Roles('order_manager', 'marketing')
  @Get('reports/returns')
  returns(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reporting.returns({ from, to });
  }

  @Roles('order_manager', 'marketing')
  @Get('payments')
  payments() {
    return this.reporting.payments();
  }

  @Roles('order_manager', 'marketing')
  @Get('reports/customers')
  customers() {
    return this.reporting.customers();
  }

  @Roles('super_admin')
  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @Roles('super_admin')
  @Put('settings')
  async setSetting(@CurrentUser() user: JwtPrincipal, @Body() dto: SettingDto) {
    await this.settings.set(user.sub, dto.key, dto.value);
    return { success: true };
  }

  @Roles('super_admin')
  @Get('serviceability')
  async getServiceability(): Promise<{ pincodes: string[] }> {
    const raw = await this.settings.get<unknown>(SERVICEABLE_PINCODES_KEY);
    const pincodes = Array.isArray(raw) ? raw.map((p) => String(p).trim()).filter(Boolean) : [];
    return { pincodes };
  }

  @Roles('super_admin')
  @Put('serviceability')
  async setServiceability(@CurrentUser() user: JwtPrincipal, @Body() dto: ServiceabilityDto) {
    // De-duplicate while preserving order.
    const unique = [...new Set(dto.pincodes.map((p) => p.trim()))];
    await this.settings.set(user.sub, SERVICEABLE_PINCODES_KEY, unique);
    return { success: true, count: unique.length };
  }

  @Roles('super_admin')
  @Get('audit')
  auditLog(@Query('page') page?: string) {
    return this.audit.list({ page: page ? Number(page) : 1 });
  }

  private maybeCsv(
    rows: Record<string, unknown>[],
    columns: string[],
    name: string,
    format: string | undefined,
    res: Response | undefined,
  ) {
    if (format === 'csv' && res) {
      const csv = this.reporting.toCsv(columns, rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      res.send(csv);
      return;
    }
    return rows;
  }
}

