import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

const roles = (fn: unknown) => Reflect.getMetadata(ROLES_KEY, fn as object) as string[] | undefined;
function makeController() {
  const prisma = {} as never;
  const service = new ReportsService(prisma);
  const report = {
    id: 'sales' as const,
    title: 'Basic sales report',
    range: { from: '2026-10-01', to: '2026-10-24' },
    cards: [],
    chart: null,
    columns: [
      { key: 'name', label: 'Name', kind: 'text' as const },
      { key: 'amount', label: 'Amount', kind: 'money' as const },
    ],
    rows: [{ name: 'Atta, 5kg', amount: 12_345 }],
    notes: [],
  };
  const build = jest.spyOn(service, 'build').mockResolvedValue(report);
  const res = { setHeader: jest.fn(), send: jest.fn() } as unknown as Response & { setHeader: jest.Mock; send: jest.Mock };
  return { ctrl: new ReportsController(service), service, build, res };
}

describe('ReportsController', () => {
  it('opens sales reports to order managers and marketing, and profit and loss to the Super Admin only', () => {
    const proto = ReportsController.prototype;
    expect(roles(proto.report)).toEqual(['order_manager', 'marketing']);
    expect(roles(proto.profitLoss)).toEqual(['super_admin']);
  });

  it('declares profit-loss before :id so the stricter route is matched first', () => {
    const names = Object.getOwnPropertyNames(ReportsController.prototype).filter((n) => n !== 'constructor' && n !== 'respond');
    expect(names.indexOf('profitLoss')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('profitLoss')).toBeLessThan(names.indexOf('report'));
  });

  it("the generic route refuses a restricted report even if it were reached", () => {
    const { ctrl, res } = makeController();
    expect(() => ctrl.report('profit-loss', {}, res)).toThrow(ForbiddenException);
  });

  it('returns JSON by default and passes the query to the service', async () => {
    const { ctrl, build, res } = makeController();
    const out = await ctrl.report('sales', { from: '2026-10-01', to: '2026-10-24', page: '2' }, res);
    expect(out).toMatchObject({ id: 'sales' });
    expect(build).toHaveBeenCalledWith('sales', expect.objectContaining({ from: '2026-10-01', to: '2026-10-24', page: 2 }), { all: false });
    expect(res.send).not.toHaveBeenCalled();
  });

  it('sends a CSV file for ?format=csv, with every row, quoted values and money in rupees', async () => {
    const { ctrl, build, res } = makeController();
    const out = await ctrl.report('sales', { format: 'csv' }, res);
    expect(out).toBeUndefined();
    expect(build).toHaveBeenCalledWith('sales', expect.anything(), { all: true });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="sales-2026-10-01_2026-10-24.csv"');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.send).toHaveBeenCalledWith('\uFEFFName,Amount\n"Atta, 5kg",123.45');
  });

  it('rejects a bad query (unknown format, page 0) instead of passing it on', async () => {
    const { ctrl, res } = makeController();
    await expect(ctrl.report('sales', { format: 'xml' }, res)).rejects.toBeInstanceOf(ZodError);
    await expect(ctrl.report('sales', { page: '0' }, res)).rejects.toBeInstanceOf(ZodError);
  });

  it('answers an unknown report with not found', async () => {
    const { ctrl, build, res } = makeController();
    build.mockRejectedValueOnce(new NotFoundException('Unknown report'));
    await expect(ctrl.report('nope', {}, res)).rejects.toBeInstanceOf(NotFoundException);
  });
});
