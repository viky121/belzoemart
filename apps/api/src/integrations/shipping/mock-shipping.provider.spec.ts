import { MockShippingProvider } from './mock-shipping.provider';

/** The mock timeline follows the order status and never runs ahead of it. */
describe('MockShippingProvider.getTracking', () => {
  const mock = new MockShippingProvider();
  const statuses = async (orderStatus?: string) =>
    (await mock.getTracking('AWB1', orderStatus === undefined ? undefined : { orderStatus })).map((e) => e.status);

  it('emits packed only without context', async () => {
    expect(await statuses()).toEqual(['packed']);
  });

  it('emits up to shipped for a shipped order', async () => {
    expect(await statuses('shipped')).toEqual(['packed', 'shipped']);
  });

  it('emits the full timeline for a delivered (or returned) order', async () => {
    expect(await statuses('delivered')).toEqual(['packed', 'shipped', 'out_for_delivery', 'delivered']);
    expect(await statuses('returned')).toEqual(['packed', 'shipped', 'out_for_delivery', 'delivered']);
  });

  it('emits packed only for cancelled / pending / confirmed orders', async () => {
    expect(await statuses('cancelled')).toEqual(['packed']);
    expect(await statuses('pending')).toEqual(['packed']);
    expect(await statuses('confirmed')).toEqual(['packed']);
  });

  it('times start at `since`, ascend, and are never in the future', async () => {
    const since = new Date(Date.now() - 60 * 60_000).toISOString(); // 1h ago
    const before = Date.now();
    const events = await mock.getTracking('AWB1', { orderStatus: 'delivered', since });
    const times = events.map((e) => Date.parse(e.occurredAt));
    expect(times[0]).toBe(Date.parse(since));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]!);
    for (const t of times) expect(t).toBeLessThanOrEqual(Date.now());
    expect(times[times.length - 1]).toBeGreaterThanOrEqual(before - 1);
  });
});
