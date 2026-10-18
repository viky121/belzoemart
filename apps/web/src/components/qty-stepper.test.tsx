import { renderToStaticMarkup } from 'react-dom/server';
import { QtyStepper } from './qty-stepper';

describe('QtyStepper', () => {
  it('shows the quantity in a typeable number box between − and +', () => {
    const html = renderToStaticMarkup(
      <QtyStepper className="qty-stepper" testId="q" rootTestId="root" value={5} onCommit={() => undefined} />,
    );
    expect(html).toMatch(/<input[^>]*data-testid="q"[^>]*value="5"/);
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('aria-label="Decrease quantity"');
    expect(html).toContain('aria-label="Increase quantity"');
  });

  it('disables − at the minimum and + at the maximum', () => {
    const atMin = renderToStaticMarkup(<QtyStepper className="x" value={1} onCommit={() => undefined} />);
    expect(atMin).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Decrease quantity"/);
    expect(atMin).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Increase quantity"/);

    const atMax = renderToStaticMarkup(<QtyStepper className="x" value={99} onCommit={() => undefined} />);
    expect(atMax).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Increase quantity"/);
  });

  it('disables everything while a save is running', () => {
    const html = renderToStaticMarkup(<QtyStepper className="x" value={3} disabled onCommit={() => undefined} />);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
