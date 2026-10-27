import { fetchPinServiceability, pinRefusal, pinVerdict } from '../pin-check';

describe('pinVerdict', () => {
  it('refuses a PIN only when the shop has a delivery list and the PIN is not on it', () => {
    expect(pinVerdict({ configured: true, serviceable: false })).toBe('bad');
    expect(pinVerdict({ configured: true, serviceable: true })).toBe('ok');
  });
  it('lets every PIN through when the shop has no delivery list', () => {
    expect(pinVerdict({ configured: false, serviceable: true })).toBe('ok');
  });
  it('does not guess when there is no answer', () => {
    expect(pinVerdict(null)).toBe('unknown');
    expect(pinVerdict(undefined)).toBe('unknown');
  });
  it('names the PIN in the refusal', () => {
    expect(pinRefusal('110001')).toContain('110001');
  });
});

describe('fetchPinServiceability', () => {
  const ok = (body: unknown) =>
    Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

  it('asks the shop about the PIN', async () => {
    globalThis.fetch = jest.fn(() => ok({ serviceable: false, configured: true })) as unknown as typeof fetch;
    expect(await fetchPinServiceability('110001')).toEqual({ serviceable: false, configured: true });
    expect(String((globalThis.fetch as jest.Mock).mock.calls[0]![0])).toContain('/settings/serviceability?pincode=110001');
  });
  it('gives null instead of throwing when the shop cannot be reached', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await fetchPinServiceability('110001')).toBeNull();
  });
});
