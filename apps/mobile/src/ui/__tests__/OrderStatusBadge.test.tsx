import { ORDER_STATUSES, statusBadge } from '@belzo/shared';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils';

import { OrderStatusBadge, TONE_COLORS } from '../OrderStatusBadge';

describe('OrderStatusBadge', () => {
  it.each(ORDER_STATUSES.map((s) => [s]))(
    'renders the shared label and tone for %s',
    async (status) => {
      const { label, tone } = statusBadge(status);
      await renderWithProviders(<OrderStatusBadge status={status} />, { navigation: false });
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByLabelText(`Order status: ${label}`)).toBeTruthy();
      const badge = screen.getByTestId(`order-status-${tone}`);
      expect(badge).toHaveStyle({ backgroundColor: TONE_COLORS[tone].bg });
      expect(screen.getByText(label)).toHaveStyle({ color: TONE_COLORS[tone].fg });
    },
  );

  it('maps tones to the design colours', () => {
    expect(statusBadge('delivered').tone).toBe('ok');
    expect(TONE_COLORS.ok.fg).toBe('#15674f');
    expect(statusBadge('cancelled').tone).toBe('bad');
    expect(TONE_COLORS.bad.fg).toBe('#b91c1c');
    expect(statusBadge('pending').tone).toBe('warn');
    expect(TONE_COLORS.warn).toEqual({ fg: '#9a5a12', bg: '#fdecd8' });
    expect(statusBadge('shipped').tone).toBe('info');
    expect(TONE_COLORS.info.fg).toBe('#e2550f');
    expect(statusBadge('returned').tone).toBe('muted');
    expect(TONE_COLORS.muted.fg).toBe('#6b7280');
  });
});
