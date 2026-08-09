import { describe, it, expect } from 'vitest';
import {
  callPeriodRanges,
  classifyHour,
  easterSunday,
  isWorkingDay,
  NOTICE_HOURS,
  polishHolidays,
  worstRisk,
} from '../callPeriod';
import { makePoint } from '../../test/factories';
import { HOUR_MS } from '../constants';

/** Builds a block on a given business date, stamped the way PSE stamps them. */
function hourOn(
  businessDate: string,
  startHour: number,
  overrides: Partial<Parameters<typeof makePoint>[0]> = {}
) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return makePoint({
    businessDate,
    hourLabel: `${pad(startHour)}:00`,
    endLabel: `${pad((startHour + 1) % 24)}:00`,
    // `time` is the END of the block — the classifier subtracts an hour for the start.
    time: new Date(`${businessDate}T${pad((startHour + 1) % 24)}:00:00Z`),
    ...overrides,
  });
}

/** Far enough in the past that every hour under test is still announceable. */
const LONG_BEFORE = new Date('2026-08-01T00:00:00Z');

describe('easterSunday', () => {
  it('matches known dates', () => {
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
  });
});

describe('polishHolidays', () => {
  it('includes the movable ones, which are the whole reason this exists', () => {
    const y2026 = polishHolidays(2026);
    expect(y2026.has('2026-04-06')).toBe(true); // Poniedziałek Wielkanocny
    expect(y2026.has('2026-06-04')).toBe(true); // Boże Ciało

    const y2025 = polishHolidays(2025);
    expect(y2025.has('2025-04-21')).toBe(true);
    expect(y2025.has('2025-06-19')).toBe(true);
  });

  it('includes the fixed ones', () => {
    const days = polishHolidays(2026);
    for (const day of [
      '2026-01-01',
      '2026-01-06',
      '2026-05-01',
      '2026-05-03',
      '2026-08-15',
      '2026-11-01',
      '2026-11-11',
      '2026-12-25',
      '2026-12-26',
    ]) {
      expect(days.has(day)).toBe(true);
    }
  });
});

describe('isWorkingDay', () => {
  it('rejects weekends', () => {
    expect(isWorkingDay('2026-08-08')).toBe(false); // sobota
    expect(isWorkingDay('2026-08-09')).toBe(false); // niedziela
  });

  it('rejects public holidays that fall on a weekday', () => {
    expect(isWorkingDay('2026-06-04')).toBe(false); // Boże Ciało, czwartek
    expect(isWorkingDay('2026-11-11')).toBe(false); // środa
  });

  it('accepts an ordinary weekday', () => {
    expect(isWorkingDay('2026-08-10')).toBe(true); // poniedziałek
  });

  it('handles a leap day and refuses nonsense rather than guessing', () => {
    expect(isWorkingDay('2024-02-29')).toBe(true); // czwartek
    expect(isWorkingDay('')).toBe(false);
    expect(isWorkingDay('10.08.2026')).toBe(false);
  });
});

describe('classifyHour', () => {
  it('marks a deficit below the exemption as high risk', () => {
    const point = hourOn('2026-08-10', 19, { reserve: 800, required: 2000 });
    expect(classifyHour(point, LONG_BEFORE).risk).toBe('high');
  });

  it('marks a deficit above the exemption as moderate, because the operator may decline', () => {
    const point = hourOn('2026-08-10', 19, { reserve: 1500, required: 2000 });
    expect(classifyHour(point, LONG_BEFORE).risk).toBe('moderate');
  });

  it('places the exemption boundary at 1100 MW itself', () => {
    const at = hourOn('2026-08-10', 19, { reserve: 1100, required: 2000 });
    const below = hourOn('2026-08-10', 19, { reserve: 1099, required: 2000 });
    expect(classifyHour(at, LONG_BEFORE).risk).toBe('moderate');
    expect(classifyHour(below, LONG_BEFORE).risk).toBe('high');
  });

  it('sees no grounds when the reserve covers what is required', () => {
    const point = hourOn('2026-08-10', 19, { reserve: 3000, required: 2000 });
    expect(classifyHour(point, LONG_BEFORE).risk).toBe('none');
  });

  it('holds the 07:00-22:00 window at both edges', () => {
    const deficit = { reserve: 500, required: 2000 };
    const before = hourOn('2026-08-10', 6, deficit);
    const first = hourOn('2026-08-10', 7, deficit);
    const last = hourOn('2026-08-10', 21, deficit);
    const after = hourOn('2026-08-10', 22, deficit);

    expect(classifyHour(before, LONG_BEFORE).risk).toBe('none');
    expect(classifyHour(first, LONG_BEFORE).risk).toBe('high');
    expect(classifyHour(last, LONG_BEFORE).risk).toBe('high');
    expect(classifyHour(after, LONG_BEFORE).risk).toBe('none');
  });

  it('sees no grounds on a day off, however deep the deficit', () => {
    const point = hourOn('2026-08-09', 19, { reserve: 0, required: 3000 });
    expect(classifyHour(point, LONG_BEFORE).risk).toBe('none');
  });

  it('says unknown rather than none when the figures are missing', () => {
    const point = hourOn('2026-08-10', 19, { reserve: null, required: null });
    expect(classifyHour(point, LONG_BEFORE).risk).toBe('unknown');
  });

  it('closes the announcement window at the required notice', () => {
    const point = hourOn('2026-08-10', 19, { reserve: 500, required: 2000 });
    const startsAt = point.time.getTime() - HOUR_MS;

    const exactly = new Date(startsAt - NOTICE_HOURS * HOUR_MS);
    const aMinuteLater = new Date(exactly.getTime() + 60 * 1000);

    expect(classifyHour(point, exactly).announceable).toBe(true);
    expect(classifyHour(point, aMinuteLater).announceable).toBe(false);
  });
});

describe('callPeriodRanges', () => {
  const deficit = { reserve: 500, required: 2000 };

  it('merges consecutive hours into one range', () => {
    const points = [17, 18, 19, 20, 21].map((hour) =>
      hourOn('2026-08-10', hour, deficit)
    );
    const ranges = callPeriodRanges(points, LONG_BEFORE);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      risk: 'high',
      from: '17:00',
      to: '22:00',
      hours: 5,
    });
  });

  it('splits when the risk level changes', () => {
    const points = [
      hourOn('2026-08-10', 17, { reserve: 1500, required: 2000 }),
      hourOn('2026-08-10', 18, { reserve: 500, required: 2000 }),
    ];
    const ranges = callPeriodRanges(points, LONG_BEFORE);

    expect(ranges.map((range) => range.risk)).toEqual(['moderate', 'high']);
  });

  it('does not bridge a calm hour', () => {
    const points = [
      hourOn('2026-08-10', 17, deficit),
      hourOn('2026-08-10', 18, { reserve: 5000, required: 2000 }),
      hourOn('2026-08-10', 19, deficit),
    ];
    expect(callPeriodRanges(points, LONG_BEFORE)).toHaveLength(2);
  });

  it('returns nothing for a calm day and for no data', () => {
    const calm = [17, 18].map((hour) =>
      hourOn('2026-08-10', hour, { reserve: 5000, required: 2000 })
    );
    expect(callPeriodRanges(calm, LONG_BEFORE)).toEqual([]);
    expect(callPeriodRanges([], LONG_BEFORE)).toEqual([]);
  });

  it('ignores hours that are already behind us', () => {
    // Hours 8 and 9 sit INSIDE the 07:00-22:00 window on purpose: night hours
    // are excluded by the window anyway, so using them would let this test pass
    // even with the forward filter removed.
    const points = [
      hourOn('2026-08-10', 8, deficit),
      hourOn('2026-08-10', 9, deficit),
      hourOn('2026-08-10', 19, { reserve: 5000, required: 2000 }),
    ];
    const noon = new Date('2026-08-10T12:00:00Z');

    expect(callPeriodRanges(points, noon)).toEqual([]);
    expect(worstRisk(callPeriodRanges(points, noon))).toBe('none');
  });

  it('keeps the hour currently in progress', () => {
    // The block 19:00-20:00 has not finished at 19:30, so it still counts.
    const points = [hourOn('2026-08-10', 19, deficit)];
    const midBlock = new Date('2026-08-10T19:30:00Z');

    expect(callPeriodRanges(points, midBlock)).toHaveLength(1);
  });

  it('reports a range as settled once every hour is inside the notice window', () => {
    const points = [17, 18].map((hour) => hourOn('2026-08-10', hour, deficit));
    const afterwards = new Date('2026-08-10T18:30:00Z');

    expect(callPeriodRanges(points, afterwards)[0].announceable).toBe(false);
  });
});

describe('worstRisk', () => {
  it('reports the worst present, and none for an empty day', () => {
    expect(
      worstRisk([
        { risk: 'moderate', from: '10:00', to: '11:00', hours: 1, announceable: true },
        { risk: 'high', from: '19:00', to: '20:00', hours: 1, announceable: true },
      ])
    ).toBe('high');
    expect(worstRisk([])).toBe('none');
  });
});
