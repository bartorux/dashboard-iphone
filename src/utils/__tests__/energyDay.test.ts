import { describe, it, expect } from 'vitest';
import { isEnergyDay } from '../energyDay';
import { emphasisFor } from '../summaryText';

describe('isEnergyDay', () => {
  it('is 14 August, whatever the year or the hour', () => {
    expect(isEnergyDay(new Date(2026, 7, 14, 0, 0))).toBe(true);
    expect(isEnergyDay(new Date(2026, 7, 14, 23, 59))).toBe(true);
    expect(isEnergyDay(new Date(2031, 7, 14, 12, 0))).toBe(true);
  });

  it('is not the neighbouring days', () => {
    expect(isEnergyDay(new Date(2026, 7, 13, 23, 59))).toBe(false);
    expect(isEnergyDay(new Date(2026, 7, 15, 0, 1))).toBe(false);
  });

  it('is not the first of September, which is what it used to be', () => {
    expect(isEnergyDay(new Date(2026, 8, 1))).toBe(false);
  });
});

describe('emphasisFor', () => {
  it('gives the same angle for the same hour, so a rerun is not a lottery', () => {
    const one = emphasisFor(new Date('2026-08-09T14:00:00Z'));
    const same = emphasisFor(new Date('2026-08-09T14:59:00Z'));

    expect(one).toBe(same);
  });

  it('moves on with the hour, which is the point of having it', () => {
    // Left to itself the model opened every hourly rewrite the same way.
    const angles = new Set(
      Array.from({ length: 5 }, (_, hour) =>
        emphasisFor(new Date(Date.UTC(2026, 7, 9, hour)))
      )
    );

    expect(angles.size).toBe(5);
  });
});
