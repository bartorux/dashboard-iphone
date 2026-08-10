import { describe, it, expect } from 'vitest';
import { niceScale, niceScaleRange, NICE_STEPS } from '../scale';

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

describe('niceScaleRange', () => {
  const cases: [number, number][] = [
    [-2000, 6000],
    [-155, 3400],
    [0, 5000],
    [-50, 50],
    [200, 900],
    [-12000, 24000],
  ];

  it.each(cases)('keeps ticks round for %i..%i', (min, max) => {
    const scale = niceScaleRange(min, max);
    const step = scale.ticks[1] - scale.ticks[0];

    expect(NICE_STEPS).toContain(step);
    scale.ticks.forEach((tick, i) =>
      expect(tick).toBeCloseTo(scale.min + i * step, 6)
    );
    expect(scale.ticks.length).toBeGreaterThanOrEqual(4);
    expect(scale.ticks.length).toBeLessThanOrEqual(7);
  });

  it.each(cases)('contains the data for %i..%i', (min, max) => {
    const scale = niceScaleRange(min, max);

    expect(scale.min).toBeLessThanOrEqual(Math.min(min, 0));
    expect(scale.max).toBeGreaterThanOrEqual(max);
  });

  it('always puts zero on a tick, so the sign is readable from the axis', () => {
    for (const [min, max] of cases) {
      expect(niceScaleRange(min, max).ticks).toContain(0);
    }
  });

  it('never draws the curve along the frame', () => {
    for (const [min, max] of cases) {
      const scale = niceScaleRange(min, max);
      expect(scale.max).toBeGreaterThan(max);
      if (min < 0) expect(scale.min).toBeLessThan(min);
    }
  });

  it('does not lose a whole step of height to rounding, as it did on 10 August', () => {
    // Live case. Two consecutive days of generation data, 800 MW apart in
    // extent, produced axes of wildly different height: padding was applied
    // before snapping, pushing the upper bound past 20 000, which needed eight
    // ticks at a step of 5000, was rejected for exceeding the limit, and fell
    // through to a step of 10 000.
    const dzis = niceScaleRange(-4240, 19639);
    const jutro = niceScaleRange(-3051, 18853);

    expect(dzis.max - dzis.min).toBe(jutro.max - jutro.min);

    // The data has to fill most of what the axis offers.
    const zajetosc = (19639 - -4240) / (dzis.max - dzis.min);
    expect(zajetosc).toBeGreaterThan(0.85);
  });

  it('survives empty or nonsensical data', () => {
    for (const [min, max] of [[NaN, NaN], [0, 0], [Infinity, -Infinity]]) {
      const scale = niceScaleRange(min, max);
      expect(Number.isFinite(scale.min)).toBe(true);
      expect(Number.isFinite(scale.max)).toBe(true);
      expect(scale.max).toBeGreaterThan(scale.min);
    }
  });
});
