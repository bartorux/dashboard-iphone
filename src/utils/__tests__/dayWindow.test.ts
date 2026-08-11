import { describe, it, expect, afterEach, vi } from 'vitest';
import { dayLabel, daysToFetch, visibleDayOffsets } from '../dayWindow';

/** Local noon, so no timezone shift can move the date under the test. */
const at = (iso: string) => new Date(`${iso}T12:00:00`);

const labelsFrom = (now: Date) =>
  visibleDayOffsets(now).map((offset) => {
    vi.setSystemTime(now);
    return dayLabel(offset);
  });

afterEach(() => vi.useRealTimers());

describe('visibleDayOffsets', () => {
  it('collects five working days, counting today when today is one', () => {
    // Tuesday: today plus Wednesday, Thursday, Friday, and over the weekend to
    // Monday — five working days across seven calendar ones.
    expect(visibleDayOffsets(at('2026-08-11'))).toEqual([0, 1, 2, 3, 6]);
  });

  it('keeps today even when today is not a working day', () => {
    // Saturday. Without this, opening the app at the weekend would offer no way
    // to look at the current day. Six chips, not five.
    expect(visibleDayOffsets(at('2026-08-15'))).toEqual([0, 2, 3, 4, 5, 6]);
    expect(visibleDayOffsets(at('2026-08-16'))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('steps over a public holiday the same way it steps over a weekend', () => {
    // 3 May 2026 falls on a Sunday, so Monday 4 May is a day off in lieu under
    // the rules polishHolidays already encodes. Friday 1 May is a holiday too.
    const offsets = visibleDayOffsets(at('2026-04-30'));
    expect(offsets).not.toContain(1); // 1 May
    expect(offsets).toHaveLength(5);
  });

  it('never returns fewer days than it promises', () => {
    for (let day = 1; day <= 28; day++) {
      const now = at(`2026-04-${String(day).padStart(2, '0')}`);
      const offsets = visibleDayOffsets(now);
      expect(offsets[0]).toBe(0);
      expect(offsets.length).toBeGreaterThanOrEqual(5);
      // Strictly increasing, so stepping through the list always moves forward.
      offsets.forEach((offset, i) => {
        if (i > 0) expect(offset).toBeGreaterThan(offsets[i - 1]);
      });
    }
  });
});

describe('daysToFetch', () => {
  it('asks for every calendar day the window reaches, not just the working ones', () => {
    // Tuesday reaches Monday at offset 6, so seven calendar days must be
    // fetched or the last tab would render empty.
    expect(daysToFetch(at('2026-08-11'))).toBe(7);
  });

  it('stays inside the row limit the API query sets', () => {
    // $first caps the forecast query; 24 rows a day means the window may never
    // reach the point where PSE truncates the response without saying so.
    for (let day = 1; day <= 28; day++) {
      expect(daysToFetch(at(`2026-12-${String(day).padStart(2, '0')}`)) * 24)
        .toBeLessThan(400);
    }
  });
});

describe('dayLabel', () => {
  it('names days the way the analysis names them', () => {
    // The tab used to say "Pojutrze" while the analysis said "w środę".
    vi.useFakeTimers();
    expect(labelsFrom(at('2026-08-11'))).toEqual([
      'Dziś',
      'śr.',
      'czw.',
      'pt.',
      'pon.',
    ]);
  });
});
