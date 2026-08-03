import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDismissibleTooltip } from '../chart/shared';

/** Stands in for a chart: reports what the tooltip gate currently says. */
function Probe() {
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();
  return (
    <div>
      <div data-testid="chart" ref={ref} {...handlers}>
        chart
      </div>
      <div data-testid="state">{String(tooltipActive)}</div>
      <button type="button">poza wykresem</button>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;
const chart = () => screen.getByTestId('chart');

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

describe('useDismissibleTooltip', () => {
  it('leaves mouse hover alone until the chart is touched', () => {
    render(<Probe />);

    // undefined hands control back to Recharts, which is right for a pointer
    expect(state()).toBe('undefined');
  });

  it('closes on the next tap — the whole point on a phone, where there is no pointer to move away', () => {
    render(<Probe />);

    fireEvent.touchStart(chart(), touch(100, 100));
    fireEvent.touchMove(chart(), touch(160, 102));
    fireEvent.touchEnd(chart());
    expect(state()).toBe('true');

    fireEvent.touchStart(chart(), touch(160, 102));
    fireEvent.touchEnd(chart());
    expect(state()).toBe('false');
  });

  it('toggles back open on a further tap', () => {
    render(<Probe />);

    fireEvent.touchStart(chart(), touch(100, 100));
    fireEvent.touchEnd(chart());
    expect(state()).toBe('true');

    fireEvent.touchStart(chart(), touch(100, 100));
    fireEvent.touchEnd(chart());
    expect(state()).toBe('false');
  });

  it('keeps the tooltip open while the chart is being scrubbed', () => {
    render(<Probe />);

    fireEvent.touchStart(chart(), touch(100, 100));
    fireEvent.touchMove(chart(), touch(140, 100));
    fireEvent.touchEnd(chart());
    fireEvent.touchStart(chart(), touch(140, 100));
    fireEvent.touchMove(chart(), touch(190, 100));
    fireEvent.touchEnd(chart());

    // A drag reads values; it must never be what closes the reading
    expect(state()).toBe('true');
  });

  it('ignores a wobble under the tap threshold', () => {
    render(<Probe />);

    fireEvent.touchStart(chart(), touch(100, 100));
    fireEvent.touchMove(chart(), touch(104, 103));
    fireEvent.touchEnd(chart());

    expect(state()).toBe('true');
  });

  it('closes when something outside the chart is touched', () => {
    render(<Probe />);

    fireEvent.touchStart(chart(), touch(100, 100));
    fireEvent.touchEnd(chart());
    expect(state()).toBe('true');

    fireEvent.touchStart(screen.getByRole('button'), touch(10, 10));
    expect(state()).toBe('false');
  });
});
