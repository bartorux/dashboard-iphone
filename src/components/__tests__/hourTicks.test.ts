import { describe, it, expect } from 'vitest';
import { hourTicks } from '../chart/shared';

const pad = (value: number) => String(value).padStart(2, '0');
const doba = (godzin: number) =>
  Array.from({ length: godzin }, (_, h) => `${pad(h)}:00`);

describe('hourTicks', () => {
  it('trzyma jednakowy odstep na calej osi', () => {
    // The last hour used to be appended whatever the rhythm, so a full day ended
    // 16 20 23 — one gap of three among gaps of four, at the end of the scale
    // the eye reaches last.
    expect(hourTicks(doba(24))).toEqual([
      '00:00',
      '04:00',
      '08:00',
      '12:00',
      '16:00',
      '20:00',
    ]);
  });

  it('nie gubi rytmu w dobie, ktora ma inna dlugosc', () => {
    // 23 and 25 hours are the clocks going forward and back. Neither may produce
    // a label closer to its neighbour than the rest.
    for (const godzin of [23, 25]) {
      const ticks = hourTicks(doba(godzin));
      const odstepy = ticks
        .slice(1)
        .map((t, i) => Number(t.slice(0, 2)) - Number(ticks[i].slice(0, 2)));
      expect(new Set(odstepy)).toEqual(new Set([4]));
    }
  });

  it('radzi sobie z pustymi danymi', () => {
    expect(hourTicks([])).toEqual([]);
  });
});
