import { renderToStaticMarkup } from 'react-dom/server';
import type { PickupInfo } from '@belzo/shared';
import type { OrderDetail } from '@/lib/order-view';
import { OrderHeader, OrderStepper, PickupDetails, PriceDetails, TrackingCard } from './order-sections';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const INFO: PickupInfo = {
  enabled: true,
  note: 'Open every day, ask at the counter',
  shop: { name: 'Belzo eMart', address: 'Brahman colony', city: 'Tikamgarh', state: 'Madhya Pradesh', pincode: '472001', phone: '8839095625' },
  days: [],
};

function order(over: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: '3f2a1c9e-4d5b-4c1a-9e33-7b5a1f0c2d11',
    status: 'confirmed',
    fulfilment: 'pickup',
    pickupSlotStart: '2026-11-01T04:30:00.000Z',
    pickupSlotEnd: '2026-11-01T05:30:00.000Z',
    createdAt: '2026-10-31T04:30:00.000Z',
    updatedAt: '2026-10-31T04:30:00.000Z',
    couponCode: null,
    cancelledReason: null,
    invoiceUrl: null,
    invoice: null,
    address: null,
    items: [],
    payments: [{ provider: 'cod', status: 'pending', method: null, amount: 10000, createdAt: '2026-10-31T04:30:00.000Z' }],
    returns: [],
    tracking: { orderStatus: 'confirmed', latestStatus: 'confirmed', latestLabel: 'Confirmed', shipments: [] },
    subtotal: 10000,
    discount: 0,
    shipping: 0,
    codFee: 0,
    tax: 476,
    cgst: 238,
    sgst: 238,
    igst: 0,
    grandTotal: 10000,
    ...over,
  } as OrderDetail;
}

describe('customer order page for a self pickup order', () => {
  it('shows the shop address, timings and the pickup time', () => {
    const html = renderToStaticMarkup(<PickupDetails order={order()} info={INFO} />);
    expect(html).toContain('Self pickup');
    expect(html).toContain('Belzo eMart');
    expect(html).toContain('Brahman colony, Tikamgarh, Madhya Pradesh - 472001');
    expect(html).toContain('8839095625');
    expect(html).toContain('Open every day, ask at the counter');
    expect(html).toContain('Pickup time: Sun, 1 Nov, 10:00 AM - 11:00 AM');
    expect(html).not.toContain('Please collect it from the shop');
  });

  it('says when it is ready, and still works if the shop details could not be loaded', () => {
    const ready = renderToStaticMarkup(<PickupDetails order={order({ status: 'packed' })} info={null} />);
    expect(ready).toContain('Our shop');
    expect(ready).toContain('Your order is ready. Please collect it from the shop.');
  });

  it('has no shipment & tracking card; a delivery order still has one', () => {
    expect(renderToStaticMarkup(<TrackingCard order={order()} />)).toBe('');
    expect(renderToStaticMarkup(<TrackingCard order={order({ fulfilment: 'delivery' })} />)).toContain('Shipment');
  });

  it('shows pickup wording in the header, stepper and prices', () => {
    const packed = order({ status: 'packed' });
    expect(renderToStaticMarkup(<OrderHeader order={packed} />)).toContain('Ready for pickup');
    expect(renderToStaticMarkup(<OrderHeader order={packed} />)).toContain('Pay at shop on pickup');
    const steps = renderToStaticMarkup(<OrderStepper order={packed} />);
    expect(steps).toContain('Ready for pickup');
    expect(steps).toContain('Picked up');
    expect(steps).not.toContain('Shipped');
    const price = renderToStaticMarkup(<PriceDetails order={packed} />);
    expect(price).toContain('Delivery (self pickup)');
    expect(price).toContain('To pay at the shop');
    expect(price).not.toContain('To pay on delivery');
  });

  it('after pick up it says paid at shop; a delivery order keeps its Cash on Delivery wording', () => {
    const done = order({ status: 'delivered', payments: [{ provider: 'cod', status: 'captured', method: 'pay_at_shop', amount: 10000, createdAt: '2026-10-31T04:30:00.000Z' }] });
    expect(renderToStaticMarkup(<OrderHeader order={done} />)).toContain('Picked up');
    const delivery = order({ fulfilment: 'delivery', pickupSlotStart: null, pickupSlotEnd: null });
    const price = renderToStaticMarkup(<PriceDetails order={delivery} />);
    expect(price).toContain('To pay on delivery');
    expect(price).not.toContain('self pickup');
  });
});
