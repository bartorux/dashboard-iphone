import { describe, it, expect } from 'vitest';
import { marginDistribution, percentile, standingFor } from '../history';
import { makePoint } from '../../test/factories';

const points = (hourLabel: string, margins: number[]) =>
  margins.map((margin, index) =>
    makePoint({
      hourLabel,
      businessDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
      reserve: 1000 + margin,
      required: 1000,
    })
  );

describe('percentile', () => {
  it('interpolates between neighbouring samples', () => {
    const sorted = [0, 10, 20, 30, 40];
    expect(percentile(sorted, 0)).toBe(0);
    expect(percentile(sorted, 0.5)).toBe(20);
    expect(percentile(sorted, 1)).toBe(40);
    expect(percentile(sorted, 0.25)).toBe(10);
    expect(percentile(sorted, 0.1)).toBeCloseTo(4, 6);
  });

  it('handles degenerate inputs without pretending to have an answer', () => {
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 0.9)).toBe(7);
  });
});

describe('marginDistribution', () => {
  it('summarises each hour across days', () => {
    const [hour] = marginDistribution(
      points('19:00', [0, 100, 200, 300, 400])
    );

    expect(hour.hourLabel).toBe('19:00');
    expect(hour.samples).toBe(5);
    expect(hour.p50).toBe(200);
    expect(hour.p10).toBeCloseTo(40, 6);
    expect(hour.p90).toBeCloseTo(360, 6);
  });

  it('keeps hours in chronological order', () => {
    const result = marginDistribution([
      ...points('19:00', [1, 2, 3]),
      ...points('04:00', [1, 2, 3]),
      ...points('23:00', [1, 2, 3]),
    ]);

    expect(result.map((h) => h.hourLabel)).toEqual(['04:00', '19:00', '23:00']);
  });

  it('drops hours with too few samples rather than showing a fake spread', () => {
    const result = marginDistribution([
      ...points('19:00', [100, 200, 300]),
      ...points('20:00', [100]),
    ]);

    expect(result.map((h) => h.hourLabel)).toEqual(['19:00']);
  });

  it('gives the repeated autumn hour its own bucket', () => {
    // Bucketing by array index would fold 03a into a neighbouring hour and
    // shift every later hour of that 25-hour day
    const result = marginDistribution([
      ...points('03:00', [100, 200, 300]),
      ...points('03a:00', [900, 900, 900]),
    ]);

    expect(result.map((h) => h.hourLabel)).toEqual(['03:00', '03a:00']);
    expect(result[1].p50).toBe(900);
  });

  it('ignores points with missing values', () => {
    const result = marginDistribution([
      ...points('19:00', [100, 200, 300]),
      makePoint({ hourLabel: '19:00', reserve: null }),
      makePoint({ hourLabel: '19:00', required: null }),
    ]);

    expect(result[0].samples).toBe(3);
  });

  it('returns nothing for an empty history', () => {
    expect(marginDistribution([])).toEqual([]);
  });
});

describe('standingFor', () => {
  const distribution = {
    hourLabel: '19:00',
    p10: 100,
    p50: 500,
    p90: 900,
    samples: 30,
  };

  it('places a value against the historical spread', () => {
    expect(standingFor(50, distribution)).toBe('below');
    expect(standingFor(500, distribution)).toBe('typical');
    expect(standingFor(1000, distribution)).toBe('above');
  });

  it('treats the band edges as typical', () => {
    expect(standingFor(100, distribution)).toBe('typical');
    expect(standingFor(900, distribution)).toBe('typical');
  });

  it('admits when it cannot tell', () => {
    expect(standingFor(null, distribution)).toBe('unknown');
    expect(standingFor(500, undefined)).toBe('unknown');
  });
});

describe('standingFor — both directions matter', () => {
  const d = { hourLabel: '19:00', p10: 100, p50: 500, p90: 900, samples: 30 };

  it('flags an hour with an unusually large margin as atypical too', () => {
    // Reporting only the downside would describe such a day as entirely
    // ordinary, which is not what the chart shows
    expect(standingFor(1200, d)).toBe('above');
    expect(standingFor(50, d)).toBe('below');
  });
});
