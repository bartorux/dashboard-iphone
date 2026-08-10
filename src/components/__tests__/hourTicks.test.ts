import { describe, it, expect } from 'vitest';
import { hourTicks } from '../chart/shared';

const pad = (value: number) => String(value).padStart(2, '0');
const dayOf = (hours: number) =>
  Array.from({ length: hours }, (_, h) => `${pad(h)}:00`);

describe('hourTicks', () => {
  it('keeps every gap on the axis the same', () => {
    // The last hour used to be appended whatever the rhythm, so a full day ended
    // 16 20 23 — one gap of three among gaps of four, at the end of the scale
    // the eye reaches last.
    expect(hourTicks(dayOf(24))).toEqual([
      '00:00',
      '04:00',
      '08:00',
      '12:00',
      '16:00',
      '20:00',
    ]);
  });

  it('holds the rhythm on a day the clocks made longer or shorter', () => {
    // 23 and 25 hours are the clocks going forward and back. Neither may produce
    // a label closer to its neighbour than the rest.
    for (const hours of [23, 25]) {
      const ticks = hourTicks(dayOf(hours));
      const gaps = ticks
        .slice(1)
        .map((t, i) => Number(t.slice(0, 2)) - Number(ticks[i].slice(0, 2)));
      expect(new Set(gaps)).toEqual(new Set([4]));
    }
  });

  it('copes with no data at all', () => {
    expect(hourTicks([])).toEqual([]);
  });
});
