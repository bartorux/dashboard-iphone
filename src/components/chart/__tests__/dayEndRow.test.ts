import { describe, it, expect } from 'vitest';
import { withDayEnd, tooltipHourKey } from '../shared';

interface Row {
  key: string;
  value: number | null;
  band: [number, number] | null;
  alert: 'alarm' | 'warn' | null;
}

const row = (key: string, value: number, alert: Row['alert'] = null): Row => ({
  key,
  value,
  band: [value, value + 100],
  alert,
});

const pad = (h: number) => String(h).padStart(2, '0');
const day = (length: number): Row[] =>
  Array.from({ length }, (_, hour) => row(`${pad(hour)}:00`, hour * 10));

/**
 * `withDayEnd` is what makes hour h land at h/24 of a chart's width instead of
 * h/23 — see the function's own comment in shared.tsx for the Recharts
 * mechanics. These tests cover the pure arithmetic in isolation, independent
 * of any one chart's Row shape.
 */
describe('withDayEnd', () => {
  it('turns 24 rows into 25', () => {
    expect(withDayEnd(day(24))).toHaveLength(25);
  });

  it('keys the appended row "24:00"', () => {
    const result = withDayEnd(day(24));
    expect(result[24].key).toBe('24:00');
  });

  it('does not touch the 24 real rows', () => {
    const input = day(24);
    const result = withDayEnd(input);
    expect(result.slice(0, 24)).toEqual(input);
  });

  it('copies every continuous field from the 23:00 row onto the closing row', () => {
    // Mutation to catch: writing zeros (or nulls) instead of spreading the
    // last row — the closing row would then draw a curve that plunges to
    // zero for the final hour instead of running the 23:00 reading flat to
    // the edge, which is the whole point of adding it.
    const result = withDayEnd(day(24));
    const last = result[23];
    const closing = result[24];
    expect(closing.value).toBe(last.value);
    expect(closing.band).toEqual(last.band);
  });

  it('applies overrides only to the closing row, leaving the real rows alone', () => {
    // Mutation to catch: overrides bleeding into the whole array, e.g. if a
    // caller's { alert: null } silently cleared every row's alert instead of
    // only the synthetic one — an alarm hour earlier in the day would lose
    // its dot.
    const input = day(24).map((r, i) => (i === 20 ? { ...r, alert: 'alarm' as const } : r));
    const result = withDayEnd(input, { alert: null });

    expect(result[20].alert).toBe('alarm'); // untouched real alert hour
    expect(result[23].alert).toBeNull(); // real 23:00 row, unaffected either way here
    expect(result[24].alert).toBeNull(); // the override actually landed
    // Everything else on the closing row still came from the 23:00 copy.
    expect(result[24].value).toBe(input[23].value);
  });

  it('leaves an empty day empty', () => {
    // Mutation to catch: manufacturing a closing row from nothing (e.g.
    // `{ key: '24:00', value: 0, ... }`) when there is no 23:00 reading to
    // extend.
    expect(withDayEnd([])).toEqual([]);
  });
});

/**
 * `tooltipHourKey` is the other half of the closing-row story: it stops the
 * synthetic "24:00" row from ever being ANNOUNCED as a fourth hour when a
 * reader hovers the sliver of plot between the real 23:00 point and the new
 * right edge.
 */
describe('tooltipHourKey', () => {
  it('reports the closing row as 23:00', () => {
    expect(tooltipHourKey('24:00')).toBe('23:00');
  });

  it('leaves every real hour label alone', () => {
    for (const key of ['00:00', '08:00', '19:00', '23:00']) {
      expect(tooltipHourKey(key)).toBe(key);
    }
  });
});
