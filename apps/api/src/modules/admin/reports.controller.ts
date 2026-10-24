import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { Roles } from '../../common/auth/roles.decorator';
import { ReportsService } from './reports.service';

const reportQuerySchema = z.object({
  from: z.string().trim().max(10).optional(),
  to: z.string().trim().max(10).optional(),
  status: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  format: z.enum(['json', 'csv']).optional(),
});

/**
 * Admin reports (Admin 11): sales, orders, users, products, categories, brands, best sellers and
 * payments for sales staff; profit and loss for the Super Admin only. `?format=csv` downloads the same
 * columns as a file. The older `reports/*` routes in AdminController stay as they are.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Declared before `:id` so it is matched first. It shows cost and profit.
  @Roles('super_admin')
  @Get('profit-loss')
  profitLoss(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    return this.respond('profit-loss', query, res);
  }

  @Roles('order_manager', 'marketing')
  @Get(':id')
  report(@Param('id') id: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    this.reports.assertNotRestricted(id);
    return this.respond(id, query, res);
  }

  private async respond(id: string, query: Record<string, unknown>, res: Response) {
    const q = reportQuerySchema.parse(query);
    const csv = q.format === 'csv';
    const report = await this.reports.build(id, q, { all: csv });
    if (!csv) return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-${report.range.from}_${report.range.to}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`\uFEFF${this.reports.toCsv(report)}`);
    return undefined;
  }
}
