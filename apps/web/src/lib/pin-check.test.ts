import { apiFetch } from './api-client';
import { checkPin, pinRefusal, pinVerdict } from './pin-check';

jest.mock('./api-client', () => ({ apiFetch: jest.fn() }));
const mockFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

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
  });
  it('names the PIN in the refusal', () => {
    expect(pinRefusal('110001')).toContain('110001');
  });
});

describe('checkPin', () => {
  beforeEach(() => mockFetch.mockReset());
  it('asks the shop about the PIN', async () => {
    mockFetch.mockResolvedValue({ serviceable: false, configured: true });
    expect(await checkPin('110001')).toEqual({ serviceable: false, configured: true });
    expect(mockFetch).toHaveBeenCalledWith('/settings/serviceability?pincode=110001');
  });
  it('gives null instead of throwing when the shop cannot be reached', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    expect(await checkPin('110001')).toBeNull();
  });
});
