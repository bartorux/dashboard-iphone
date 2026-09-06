import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SegmentedControl, { Segment } from '../SegmentedControl';

const segments: Segment<string>[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
];

function renderControl(value: string, onChange = vi.fn()) {
  const utils = render(
    <SegmentedControl
      segments={segments}
      value={value}
      onChange={onChange}
      ariaLabel="Test"
    />
  );
  return { onChange, ...utils };
}

describe('SegmentedControl — klawiatura (roving tabindex, automatic activation)', () => {
  it('klik nadal wybiera segment', () => {
    const { onChange } = renderControl('a');

    fireEvent.click(screen.getByRole('tab', { name: 'B' }));

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('tylko aktywny przycisk jest w kolejności Tab (tabIndex=0), reszta jest -1', () => {
    renderControl('b');

    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('tabIndex', '-1');
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('tabIndex', '0');
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('tabIndex', '-1');
  });

  it('ArrowRight z ostatniego segmentu zawija do pierwszego', () => {
    const { onChange } = renderControl('c');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('ArrowLeft z pierwszego segmentu zawija do ostatniego', () => {
    const { onChange } = renderControl('a');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('Home przenosi wybór na pierwszy segment', () => {
    const { onChange } = renderControl('c');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'Home' });

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('End przenosi wybór na ostatni segment', () => {
    const { onChange } = renderControl('a');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'End' });

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('po strzałce fokus ląduje na nowo wybranym przycisku', () => {
    // onChange alone would leave focus stuck on the old (now tabIndex=-1)
    // button — the DOM focus must move together with the selection.
    renderControl('a');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'B' })).toHaveFocus();
  });

  it('nieobsłużony klawisz nic nie robi', () => {
    const { onChange } = renderControl('a');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('działa też dla role="radiogroup" (ustawienia)', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        segments={segments}
        value="a"
        onChange={onChange}
        ariaLabel="Motyw"
        role="radiogroup"
      />
    );

    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('b');
  });
});
