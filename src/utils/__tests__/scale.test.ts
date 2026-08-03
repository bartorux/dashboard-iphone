import { describe, it, expect } from 'vitest';
import { niceScale, NICE_STEPS } from '../scale';

/**
 * Bug: ReserveChart used domain={[0, max * 1.1]}, so Recharts divided that raw
 * range and produced axis labels like 393 / 786 / 1179. Every tick must land on
 * a round number instead.
 */
describe('niceScale', () => {
  const maxima = [0, 17, 480, 999, 1000, 1966, 2500, 5310, 6001, 12345, 23000];

  it.each(maxima)('produces evenly spaced round ticks for max=%i', (max) => {
    const { ticks } = niceScale(max);

    const step = ticks[1] - ticks[0];
    expect(NICE_STEPS).toContain(step);
    expect(ticks.every((t) => t % step === 0)).toBe(true);

    // evenly spaced, no floating point drift
    ticks.forEach((t, i) => expect(t).toBe(i * step));
  });

  it.each(maxima)('covers the data and keeps 4-7 ticks for max=%i', (max) => {
    const { ticks, max: domainMax } = niceScale(max);

    expect(ticks[0]).toBe(0);
    expect(domainMax).toBeGreaterThanOrEqual(max);
    expect(ticks[ticks.length - 1]).toBe(domainMax);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(7);
  });

  it('leaves headroom above the maximum instead of clipping the line', () => {
    // 2000 must not end up as the top of the domain — the curve would touch the frame
    expect(niceScale(2000).max).toBeGreaterThan(2000);
  });

  it('survives empty data instead of returning NaN / -Infinity', () => {
    // Math.max(...[]) is -Infinity — the old code fed that straight into the axis
    for (const bad of [0, NaN, -Infinity, -5]) {
      const { max, ticks } = niceScale(bad);
      expect(Number.isFinite(max)).toBe(true);
      expect(max).toBeGreaterThan(0);
      expect(ticks.every(Number.isFinite)).toBe(true);
    }
  });
});
