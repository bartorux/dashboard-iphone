import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildAlertRanges,
  classifyMargin,
  findAlerts,
  findCurrentPoint,
  getUpcomingStatus,
} from '../dataTransform';
import { PSEDataPoint } from '../../types';

const HOUR = 60 * 60 * 1000;
const BASE = Date.UTC(2026, 7, 3, 0, 0, 0);

/** Builds a day of points where `reserve - required` equals the given margin. */
function series(margins: (number | null)[]): PSEDataPoint[] {
  return margins.map((margin, index) => ({
    time: new Date(BASE + index * HOUR),
    timeStr: `2026-08-03 ${String(index).padStart(2, '0')}:00:00`,
    businessDate: '2026-08-03',
    period: '',
    reserve: margin === null ? null : 1000 + margin,
    required: margin === null ? null : 1000,
  }));
}

function rangesFor(margins: (number | null)[], orange = 500, red = 300) {
  const data = series(margins);
  return buildAlertRanges(data, findAlerts(data, orange, red));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildAlertRanges', () => {
  it('collapses consecutive alert hours into one entry', () => {
    // hours 2,3,4,5 breach the red threshold, the rest are comfortable
    const ranges = rangesFor([900, 900, 100, 100, 100, 100, 900, 900]);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({
      severity: 'red',
      from: '02:00',
      to: '06:00',
      hours: 4,
    });
  });

  it('splits a run when a comfortable hour interrupts it', () => {
    const ranges = rangesFor([100, 100, 900, 100, 900]);

    expect(ranges.map((r) => [r.from, r.to])).toEqual([
      ['00:00', '02:00'],
      ['03:00', '04:00'],
    ]);
  });

  it('does not merge different severities into one range', () => {
    // 100 -> red, 400 -> orange
    const ranges = rangesFor([100, 400]);

    expect(ranges).toHaveLength(2);
    expect(ranges.map((r) => r.severity)).toEqual(['red', 'orange']);
  });

  it('reports the worst margin inside the range', () => {
    const [range] = rangesFor([250, 100, 200, 900]);

    expect(range.hours).toBe(3);
    expect(range.worstDifference).toBe(100);
    expect(range.reserve).toBe(1100);
  });

  it('renders a single alert hour as a one-hour range', () => {
    const [range] = rangesFor([900, 100, 900]);

    expect(range.from).toBe('01:00');
    expect(range.to).toBe('02:00');
    expect(range.hours).toBe(1);
  });

  it('does not merge across a gap in the data', () => {
    const ranges = rangesFor([100, null, 100]);

    expect(ranges).toHaveLength(2);
  });

  it('returns nothing when there are no alerts', () => {
    expect(rangesFor([900, 900, 900])).toEqual([]);
    expect(buildAlertRanges([], { orange: [], red: [] })).toEqual([]);
  });
});

describe('classifyMargin', () => {
  it('applies both thresholds inclusively', () => {
    expect(classifyMargin(300, 500, 300)).toBe('alarm');
    expect(classifyMargin(301, 500, 300)).toBe('warn');
    expect(classifyMargin(500, 500, 300)).toBe('warn');
    expect(classifyMargin(501, 500, 300)).toBe('ok');
  });

  it('reports unknown for missing values', () => {
    expect(classifyMargin(null, 500, 300)).toBe('unknown');
    expect(classifyMargin(NaN, 500, 300)).toBe('unknown');
  });
});

describe('findCurrentPoint / getUpcomingStatus', () => {
  it('picks the period that has not ended yet', () => {
    vi.useFakeTimers();
    // 03:30 UTC — the period ending at 04:00 is the one in progress
    vi.setSystemTime(new Date(BASE + 3.5 * HOUR));

    const data = series([900, 900, 900, 900, 900, 900]);
    expect(findCurrentPoint(data)?.timeStr).toBe('2026-08-03 04:00:00');
  });

  it('returns undefined once every period is in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE + 99 * HOUR));

    expect(findCurrentPoint(series([900, 900]))).toBeUndefined();
  });

  it('reports the worst status among the upcoming hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE + 0.5 * HOUR));

    // index 0 has already ended, so the window covers indices 1-3
    expect(getUpcomingStatus(series([900, 900, 100, 900]), 500, 300)).toBe(
      'alarm'
    );
    // index 4 sits past the end of the three-hour window
    expect(
      getUpcomingStatus(series([900, 900, 900, 900, 100]), 500, 300)
    ).toBe('ok');
  });

  it('reports unknown when nothing lies ahead', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE + 99 * HOUR));

    expect(getUpcomingStatus(series([900, 900]), 500, 300)).toBe('unknown');
  });
});
