import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  processData,
  getDataForDay,
  findAlerts,
  getValidReserves,
  hasReadings,
  safeAvg,
} from '../dataTransform';
import { PSERawItem } from '../../types';
import { makePoint } from '../../test/factories';

import fixture72h from '../__fixtures__/pse-72h.json';
import fixtureAutumn from '../__fixtures__/pse-dst-autumn.json';
import fixtureSpring from '../__fixtures__/pse-dst-spring.json';

const RAW_72H = (fixture72h as { value: PSERawItem[] }).value;
const RAW_AUTUMN = (fixtureAutumn as { value: PSERawItem[] }).value;
const RAW_SPRING = (fixtureSpring as { value: PSERawItem[] }).value;

/** The fixture covers business days 2026-08-03 .. 2026-08-05. */
function pinToFixtureDay() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('processData — 72h fixture', () => {
  beforeEach(pinToFixtureDay);

  it('keeps every hour the API returned, including the last one', () => {
    const points = processData(RAW_72H);

    expect(points).toHaveLength(72);
    // Bug 1.1: the last hour (00:00 of the 4th day) used to be dropped by the
    // date-only $filter, leaving a permanent gap at the end of "pojutrze"
    expect(points.filter((p) => p.reserve === null)).toHaveLength(0);
    expect(points.filter((p) => p.required === null)).toHaveLength(0);
  });

  it('spans 01:00 of the first business day to 00:00 after the last', () => {
    const points = processData(RAW_72H);

    expect(points[0].timeStr).toBe('2026-08-03 01:00:00');
    expect(points[71].timeStr).toBe('2026-08-06 00:00:00');
    expect(points[0].businessDate).toBe('2026-08-03');
    expect(points[71].businessDate).toBe('2026-08-05');
  });

  it('orders points chronologically by their UTC instant', () => {
    const points = processData(RAW_72H);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].time.getTime()).toBeGreaterThan(
        points[i - 1].time.getTime()
      );
    }
  });

  it('does not invent data for hours the API did not return', () => {
    const withHole = RAW_72H.filter((_, i) => i !== 10);
    const points = processData(withHole);

    const missing = points.filter((p) => p.reserve === null);
    expect(missing).toHaveLength(1);
    expect(points).toHaveLength(72);
  });

  it('keeps a record whose required reserve is legitimately 0', () => {
    // Bug 1.7: `!item.req_pow_res` also skipped a valid 0
    const withZero: PSERawItem[] = RAW_72H.map((item, i) =>
      i === 5 ? { ...item, req_pow_res: 0 } : item
    );
    const points = processData(withZero);

    expect(points).toHaveLength(72);
    expect(points[5].required).toBe(0);
  });

  it('returns an empty array for empty input', () => {
    expect(processData([])).toEqual([]);
  });
});

describe('processData — daylight saving time', () => {
  it('keeps all 25 hours of the autumn switch day, including "03a"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 9, 26, 12));

    // PSE emits plan_dtime "2025-10-26 03a:00:00" — new Date() gives NaN for it,
    // so the hour-offset arithmetic silently dropped the record
    const points = processData(RAW_AUTUMN);
    const day = getDataForDay(points, 0);

    expect(day).toHaveLength(25);
    expect(day.every((p) => p.businessDate === '2025-10-26')).toBe(true);
    expect(day.every((p) => p.reserve !== null)).toBe(true);
    expect(day.some((p) => p.timeStr.includes('03a'))).toBe(true);
  });

  it('keeps all 23 hours of the spring switch day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 29, 12));

    const points = processData(RAW_SPRING);
    const day = getDataForDay(points, 0);

    expect(day).toHaveLength(23);
    expect(day.every((p) => p.businessDate === '2026-03-29')).toBe(true);
    expect(day.every((p) => p.reserve !== null)).toBe(true);
  });
});

describe('getDataForDay', () => {
  beforeEach(pinToFixtureDay);

  it('slices by business day, not by a fixed 24-hour offset', () => {
    const points = processData(RAW_72H);

    expect(getDataForDay(points, 0).every((p) => p.businessDate === '2026-08-03')).toBe(true);
    expect(getDataForDay(points, 1).every((p) => p.businessDate === '2026-08-04')).toBe(true);
    expect(getDataForDay(points, 2).every((p) => p.businessDate === '2026-08-05')).toBe(true);
  });

  it('returns 24 points per ordinary day', () => {
    const points = processData(RAW_72H);
    expect(getDataForDay(points, 0)).toHaveLength(24);
    expect(getDataForDay(points, 1)).toHaveLength(24);
    expect(getDataForDay(points, 2)).toHaveLength(24);
  });

  it('returns an empty array for a day with no data', () => {
    expect(getDataForDay(processData(RAW_72H), 5)).toEqual([]);
    expect(getDataForDay([], 0)).toEqual([]);
  });
});

describe('findAlerts', () => {
  const point = (reserve: number | null, required: number | null, key: string) =>
    makePoint({ timeStr: key, reserve, required });

  it('treats a margin exactly at the threshold as an alert', () => {
    const { red, orange } = findAlerts([point(1300, 1000, 'a')], 500, 300);
    expect(red).toHaveLength(1);
    expect(orange).toHaveLength(0);
  });

  it('classifies orange strictly between the thresholds', () => {
    const { red, orange } = findAlerts([point(1400, 1000, 'a')], 500, 300);
    expect(red).toHaveLength(0);
    expect(orange).toHaveLength(1);
    expect(orange[0].difference).toBe(400);
  });

  it('reports nothing when the margin is comfortable', () => {
    const { red, orange } = findAlerts([point(2000, 1000, 'a')], 500, 300);
    expect(red).toHaveLength(0);
    expect(orange).toHaveLength(0);
  });

  it('flags a deficit as red even with unusual thresholds', () => {
    const { red } = findAlerts([point(900, 1000, 'a')], 500, -1000);
    expect(red).toHaveLength(1);
  });

  it('skips points with missing values instead of comparing null', () => {
    const { red, orange } = findAlerts(
      [point(null, 1000, 'a'), point(1000, null, 'b'), point(null, null, 'c')],
      500,
      300
    );
    expect(red).toHaveLength(0);
    expect(orange).toHaveLength(0);
  });

  it('never puts the same hour in both lists', () => {
    const { red, orange } = findAlerts(processData(RAW_72H), 100000, 99999);
    const overlap = red.filter((r) => orange.some((o) => o.time === r.time));
    expect(overlap).toHaveLength(0);
  });
});

describe('getValidReserves / safeAvg', () => {
  it('drops nulls and NaN', () => {
    const points = processData(RAW_72H.slice(0, 3)).map((p, i) =>
      i === 0 ? { ...p, reserve: null } : p
    );
    expect(getValidReserves(points)).toHaveLength(2);
  });

  it('returns null for an empty set instead of NaN', () => {
    expect(safeAvg([])).toBeNull();
    expect(safeAvg([100, 200])).toBe(150);
  });
});

describe('processData — hour labels', () => {
  beforeEach(pinToFixtureDay);

  it('labels each point with the hour the period STARTS, not ends', () => {
    // PSE stamps periods with their end: the block covering 19:00-20:00 carries
    // plan_dtime 20:00. Showing that stamp put every hour in the UI one hour
    // later than the time it actually describes.
    const points = processData(RAW_72H);

    expect(points[0].hourLabel).toBe('00:00');
    expect(points[0].endLabel).toBe('01:00');
    expect(points[0].timeStr).toBe('2026-08-03 01:00:00');
  });

  it('runs the day from 00:00 to 23:00 rather than 01:00 to 00:00', () => {
    const day = getDataForDay(processData(RAW_72H), 0);

    expect(day[0].hourLabel).toBe('00:00');
    expect(day[day.length - 1].hourLabel).toBe('23:00');
    expect(day[day.length - 1].endLabel).toBe('00:00');
  });

  it('keeps the duplicated autumn hour distinguishable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 9, 26, 12));

    const labels = getDataForDay(processData(RAW_AUTUMN), 0).map((p) => p.hourLabel);

    expect(labels).toHaveLength(25);
    expect(new Set(labels).size).toBe(25);
    expect(labels).toContain('03:00');
    expect(labels).toContain('03a:00');
  });

  it('derives a label for gap-filled points, which carry no period', () => {
    const withHole = RAW_72H.filter((_, i) => i !== 10);
    const filled = processData(withHole).find((p) => p.reserve === null);

    expect(filled).toBeDefined();
    expect(filled!.period).toBe('');
    expect(filled!.hourLabel).toMatch(/^\d{2}:00$/);
  });
});

describe('hasReadings', () => {
  it('refuses to call a day present when nothing in it can be judged', () => {
    // The bug this replaced: "has data" tested the reserve alone, while every
    // classifier needs the required level too. A day like this counted as
    // present, produced no alerts because no hour could be classified, and
    // earned a green "Brak alertów w tym dniu".
    const bezWymaganej = [
      makePoint({ reserve: 2000, required: null }),
      makePoint({ reserve: 2100, required: null }),
    ];
    expect(hasReadings(bezWymaganej)).toBe(false);
    expect(findAlerts(bezWymaganej, 500, 300).red).toHaveLength(0);
  });

  it('accepts a day where at least one hour carries both figures', () => {
    expect(
      hasReadings([
        makePoint({ reserve: null, required: null }),
        makePoint({ reserve: 2000, required: 1800 }),
      ])
    ).toBe(true);
    expect(hasReadings([])).toBe(false);
  });
});
