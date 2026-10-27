import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { assertAccessCan } from '../../common/auth/admin-access.service';
import { RequirePermission } from '../../common/auth/permissions.decorator';
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
 * payments (reports.view); profit and loss (reports.profit). `?format=csv` downloads the same
 * columns as a file. The older `reports/*` routes in AdminController stay as they are.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // Declared before `:id` so it is matched first. It shows cost and profit.
  @RequirePermission('reports.profit')
  @Get('profit-loss')
  profitLoss(@Req() req: Request, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    return this.respond('profit-loss', query, req, res);
  }

  @RequirePermission('reports.view')
  @Get(':id')
  report(@Req() req: Request, @Param('id') id: string, @Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    this.reports.assertNotRestricted(id);
    return this.respond(id, query, req, res);
  }

  private async respond(id: string, query: Record<string, unknown>, req: Request, res: Response) {
    const q = reportQuerySchema.parse(query);
    const csv = q.format === 'csv';
    // Downloading is its own permission: a staff type may see a report without being able to export it.
    if (csv) assertAccessCan(req.adminAccess, 'reports.export');
    const report = await this.reports.build(id, q, { all: csv });
    if (!csv) return report;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-${report.range.from}_${report.range.to}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`\uFEFF${this.reports.toCsv(report)}`);
    return undefined;
  }
}
