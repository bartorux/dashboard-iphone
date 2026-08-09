import { describe, it, expect } from 'vitest';
import { alertSpans } from '../alertSpans';
import { buildAlertRanges, findAlerts } from '../dataTransform';
import { makePoint } from '../../test/factories';
import { AlertRange } from '../../types';

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  `${String(hour).padStart(2, '0')}:00`
);

function range(overrides: Partial<AlertRange> = {}): AlertRange {
  return {
    severity: 'red',
    from: '17:00',
    to: '23:00',
    worstDifference: -1232,
    worstHour: '19:00',
    reserve: 765,
    required: 1997,
    hours: 6,
    ...overrides,
  };
}

describe('alertSpans', () => {
  it('draws one span for a range however many hours it merges', () => {
    // The point of the change: six breaching hours used to draw six rules,
    // which merged into hatching and read as damage rather than information.
    const spans = alertSpans(HOURS, [range()]);

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ from: '17:00', to: '23:00', severity: 'red' });
  });

  it('keeps a single-hour range visible', () => {
    const spans = alertSpans(HOURS, [
      range({ from: '07:00', to: '08:00', hours: 1 }),
    ]);

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ from: '07:00', to: '08:00' });
  });

  it('clamps a range ending at midnight instead of wrapping the chart', () => {
    // "00:00" is the axis's first category: taken literally the shading would
    // run backwards across the whole day.
    const spans = alertSpans(HOURS, [
      range({ from: '22:00', to: '00:00', hours: 2 }),
    ]);

    expect(spans[0].to).toBe('23:00');
  });

  it('drops a range that starts outside the plotted day', () => {
    const spans = alertSpans(['10:00', '11:00'], [range({ from: '17:00' })]);

    expect(spans).toEqual([]);
  });

  it('returns nothing for a day without alerts, and for an empty axis', () => {
    expect(alertSpans(HOURS, [])).toEqual([]);
    expect(alertSpans([], [range()])).toEqual([]);
  });

  it('carries severity through, so warnings do not render as alarms', () => {
    const spans = alertSpans(HOURS, [
      range({ severity: 'orange', from: '06:00', to: '07:00' }),
    ]);

    expect(spans[0].severity).toBe('orange');
  });

  it('gives every span a distinct key when a day has several', () => {
    const spans = alertSpans(HOURS, [
      range({ severity: 'orange', from: '06:00', to: '07:00' }),
      range({ from: '07:00', to: '08:00' }),
      range({ from: '17:00', to: '23:00' }),
    ]);

    expect(new Set(spans.map((span) => span.key)).size).toBe(3);
  });

  it('spans exactly what the alerts panel lists, end to end', () => {
    // Both views read the same ranges; this is the property that keeps the
    // chart from disagreeing with the list printed under it.
    const data = HOURS.map((hourLabel, hour) =>
      makePoint({
        hourLabel,
        endLabel: HOURS[(hour + 1) % 24],
        timeStr: `2026-08-03 ${hourLabel}:00`,
        required: 2000,
        // Hours 17-22 breach; everything else sits comfortably clear.
        reserve: hour >= 17 && hour <= 22 ? 1500 : 4000,
      })
    );

    const ranges = buildAlertRanges(data, findAlerts(data, 500, 300));
    const spans = alertSpans(HOURS, ranges);

    expect(ranges).toHaveLength(1);
    expect(spans).toHaveLength(1);
    expect(spans[0].from).toBe(ranges[0].from);
    expect(spans[0].to).toBe(ranges[0].to);
  });
});
