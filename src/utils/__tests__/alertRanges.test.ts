import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildAlertRanges,
  classifyMargin,
  findAlerts,
  findCurrentPoint,
  getUpcomingStatus,
} from '../dataTransform';
import { PSEDataPoint } from '../../types';
import { makePoint } from '../../test/factories';

const HOUR = 60 * 60 * 1000;
const BASE = Date.UTC(2026, 7, 3, 0, 0, 0);

/** Builds a day of points where `reserve - required` equals the given margin. */
function series(margins: (number | null)[]): PSEDataPoint[] {
  // Mirrors the real shape: plan_dtime is the period END, so index 0 carries the
  // 01:00 stamp while describing the 00:00-01:00 block.
  const pad = (n: number) => String(n).padStart(2, '0');
  return margins.map((margin, index) =>
    makePoint({
      // time is the period END, so block `index` covers BASE+index .. BASE+index+1
      time: new Date(BASE + (index + 1) * HOUR),
      timeStr: `2026-08-03 ${pad(index + 1)}:00:00`,
      period: `${pad(index)} - ${pad(index + 1)}`,
      hourLabel: `${pad(index)}:00`,
      endLabel: `${pad(index + 1)}:00`,
      reserve: margin === null ? null : 1000 + margin,
      required: margin === null ? null : 1000,
    })
  );
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
    // half past the 03:00 block — that block is the one in progress
    vi.setSystemTime(new Date(BASE + 3.5 * HOUR));

    const data = series([900, 900, 900, 900, 900, 900]);
    expect(findCurrentPoint(data)?.hourLabel).toBe('03:00');
    expect(findCurrentPoint(data)?.endLabel).toBe('04:00');
  });

  it('returns undefined once every period is in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE + 99 * HOUR));

    expect(findCurrentPoint(series([900, 900]))).toBeUndefined();
  });

  it('reports the worst status among the upcoming hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE + 0.5 * HOUR));

    // the 00:00 block is still running, so the window covers blocks 00-02
    expect(getUpcomingStatus(series([900, 900, 100, 900]), 500, 300)).toBe(
      'alarm'
    );
    // the fifth block sits past the end of the three-hour window
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

describe('buildAlertRanges — hours describe the block they cover', () => {
  it('reports the clock time the alarm actually covers', () => {
    // index 19 carries the 20:00 stamp and covers 19:00-20:00
    const margins = Array(24).fill(900);
    margins[19] = -49;

    const [range] = rangesFor(margins);

    expect(range.from).toBe('19:00');
    expect(range.to).toBe('20:00');
    expect(range.hours).toBe(1);
  });

  it('spans start of the first block to end of the last', () => {
    const margins = Array(24).fill(900);
    margins[19] = 100;
    margins[20] = 100;
    margins[21] = 100;

    const [range] = rangesFor(margins);

    expect(range.from).toBe('19:00');
    expect(range.to).toBe('22:00');
    expect(range.hours).toBe(3);
  });
});
