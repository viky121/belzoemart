import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils';

import { parseQty, QtyValue } from '../QtyValue';
import { QuantitySelector } from '../QuantitySelector';

describe('parseQty', () => {
  it('keeps digits, clamps to the range and rejects empty input', () => {
    expect(parseQty('12', 1, 99)).toBe(12);
    expect(parseQty('0', 1, 99)).toBe(1);
    expect(parseQty('500', 1, 99)).toBe(99);
    expect(parseQty('0', 0, 99)).toBe(0);
    expect(parseQty('a7b', 1, 99)).toBe(7);
    expect(parseQty('', 1, 99)).toBeNull();
    expect(parseQty('abc', 1, 99)).toBeNull();
  });
});

async function edit(text: string, props: Partial<Parameters<typeof QtyValue>[0]> = {}) {
  const onCommit = jest.fn();
  await renderWithProviders(<QtyValue value={2} onCommit={onCommit} {...props} />, { navigation: false });
  await fireEvent.press(screen.getByTestId('qty-value'));
  const input = screen.getByTestId('qty-input');
  await fireEvent.changeText(input, text);
  return { onCommit, input };
}

describe('QtyValue', () => {
  it('lets you tap the number, type a quantity and apply it when you leave the field', async () => {
    const { onCommit, input } = await edit('12');
    await fireEvent(input, 'blur');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(12);
    expect(screen.queryByTestId('qty-input')).toBeNull();
  });

  it('applies on Done and does not apply twice when blur follows', async () => {
    const { onCommit, input } = await edit('7');
    await fireEvent(input, 'submitEditing');
    await fireEvent(input, 'blur');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(7);
  });

  it('clamps to the maximum and the minimum', async () => {
    const high = await edit('500', { max: 99 });
    await fireEvent(high.input, 'blur');
    expect(high.onCommit).toHaveBeenCalledWith(99);
  });

  it('ignores an empty entry or an unchanged number', async () => {
    const empty = await edit('');
    await fireEvent(empty.input, 'blur');
    expect(empty.onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId('qty-value')).toHaveTextContent('2');
  });

  it('cannot be edited while disabled', async () => {
    await renderWithProviders(<QtyValue value={3} onCommit={jest.fn()} disabled />, { navigation: false });
    await fireEvent.press(screen.getByTestId('qty-value'));
    expect(screen.queryByTestId('qty-input')).toBeNull();
  });
});

describe('QuantitySelector typing', () => {
  it('applies a typed quantity through onChange and keeps the +/- buttons', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<QuantitySelector value={2} onChange={onChange} label="Rice" max={20} />, {
      navigation: false,
    });
    await fireEvent.press(screen.getByTestId('qty-value'));
    await fireEvent.changeText(screen.getByTestId('qty-input'), '18');
    await fireEvent(screen.getByTestId('qty-input'), 'blur');
    await fireEvent.press(screen.getByLabelText('Increase Rice'));
    expect(onChange.mock.calls).toEqual([[18], [3]]);
  });
});
