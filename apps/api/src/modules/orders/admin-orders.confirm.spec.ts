import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';

/** The admin button for a pending Cash on Delivery order. */
const admin = { sub: 'admin1', kind: 'admin', roles: ['super_admin'] } as never;

function make(confirmed: boolean) {
  const payments = { confirmCodOrder: jest.fn().mockResolvedValue(confirmed) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const controller = new AdminOrdersController({} as never, {} as never, {} as never, {} as never, audit as never, payments as never);
  return { controller, payments, audit };
}

describe('AdminOrdersController.confirm', () => {
  it('confirms a pending Cash on Delivery order and writes it to the audit log', async () => {
    const { controller, payments, audit } = make(true);
    expect(await controller.confirm(admin, 'o1')).toEqual({ orderId: 'o1', status: 'confirmed' });
    expect(payments.confirmCodOrder).toHaveBeenCalledWith('o1');
    expect(audit.record).toHaveBeenCalledWith('admin1', 'order.confirm_cod', 'o1', { status: 'pending' }, { status: 'confirmed' });
  });

  it('says why when the order cannot be confirmed here (online, already confirmed, cancelled)', async () => {
    const { controller, audit } = make(false);
    await expect(controller.confirm(admin, 'o1')).rejects.toThrow(BadRequestException);
    await expect(controller.confirm(admin, 'o1')).rejects.toThrow(/Cash on Delivery/);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
