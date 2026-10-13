import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils';

import { QuantitySelector } from '../QuantitySelector';

const render = (props: Partial<Parameters<typeof QuantitySelector>[0]> = {}) => {
  const onChange = jest.fn();
  return renderWithProviders(
    <QuantitySelector value={2} onChange={onChange} label="Rice" {...props} />,
    { navigation: false },
  ).then((r) => ({ ...r, onChange: (props.onChange as jest.Mock | undefined) ?? onChange }));
};

describe('QuantitySelector', () => {
  it('increments and decrements within bounds', async () => {
    const { onChange } = await render();
    expect(screen.getByTestId('qty-value')).toHaveTextContent('2');
    await fireEvent.press(screen.getByLabelText('Increase Rice'));
    await fireEvent.press(screen.getByLabelText('Decrease Rice'));
    expect(onChange.mock.calls).toEqual([[3], [1]]);
  });

  it('disables decrement at min and increment at max', async () => {
    await render({ value: 1 });
    expect(screen.getByLabelText('Decrease Rice')).toBeDisabled();
    expect(screen.getByLabelText('Increase Rice')).toBeEnabled();
    await screen.rerender(<QuantitySelector value={99} onChange={jest.fn()} label="Rice" />);
    expect(screen.getByLabelText('Increase Rice')).toBeDisabled();
    expect(screen.getByLabelText('Decrease Rice')).toBeEnabled();
  });

  it('disables both buttons when disabled or busy', async () => {
    await render({ disabled: true });
    expect(screen.getByLabelText('Increase Rice')).toBeDisabled();
    expect(screen.getByLabelText('Decrease Rice')).toBeDisabled();
    await screen.rerender(<QuantitySelector value={2} onChange={jest.fn()} label="Rice" busy />);
    expect(screen.getByLabelText('Increase Rice')).toBeDisabled();
    expect(screen.queryByTestId('qty-value')).toBeNull();
  });

  it('exposes adjustable accessibility actions', async () => {
    const onChange = jest.fn();
    await render({ onChange, value: 5 });
    const adjustable = screen.getByRole('adjustable');
    expect(adjustable.props.accessibilityValue).toMatchObject({ min: 1, max: 99, now: 5 });
    await fireEvent(adjustable, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await fireEvent(adjustable, 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange.mock.calls).toEqual([[6], [4]]);
  });

  it('ignores accessibility actions past the bounds', async () => {
    const onChange = jest.fn();
    await render({ onChange, value: 99 });
    await fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
