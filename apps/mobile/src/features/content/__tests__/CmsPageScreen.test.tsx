import { waitFor } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/types';
import { renderWithProviders } from '@/test-utils';

import { CmsPageScreen } from '../screens/CmsPageScreen';

function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function props(slug: string) {
  return {
    navigation: { setOptions: jest.fn() },
    route: { params: { slug } },
  } as unknown as RootScreenProps<'CmsPage'>;
}

describe('CmsPageScreen', () => {
  it('shows section headings, bullets and paragraphs from the page text', async () => {
    globalThis.fetch = jest.fn(() =>
      respond(200, {
        id: '1',
        slug: 'terms',
        title: 'Terms & Conditions',
        body: '## Delivery\nWe deliver in Tikamgarh.\n- Free above ₹300\n- Else ₹30',
        isActive: true,
        updatedAt: '2026-10-17T00:00:00Z',
      }),
    ) as unknown as typeof fetch;

    const ui = await renderWithProviders(<CmsPageScreen {...props('terms')} />);
    await waitFor(() => expect(ui.getByText('Delivery')).toBeTruthy());
    expect(ui.getByText('Terms & Conditions')).toBeTruthy();
    expect(ui.getByText('We deliver in Tikamgarh.')).toBeTruthy();
    expect(ui.getByText('Free above ₹300')).toBeTruthy();
    expect(ui.getByText('Else ₹30')).toBeTruthy();
    // the marker characters themselves are not shown
    expect(ui.queryByText('## Delivery')).toBeNull();
    expect(ui.queryByText('- Free above ₹300')).toBeNull();
  });

  it('shows "not available" for a page an admin switched off (404)', async () => {
    globalThis.fetch = jest.fn(() => respond(404, { statusCode: 404, error: 'NotFound', message: 'Page not found' })) as unknown as typeof fetch;
    const ui = await renderWithProviders(<CmsPageScreen {...props('terms')} />);
    await waitFor(() => expect(ui.getByText('This page is not available')).toBeTruthy());
  });
});
