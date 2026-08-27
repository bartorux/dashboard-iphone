import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Same workaround as reserveChart.test.tsx: ResponsiveContainer measures its
// parent, which jsdom always reports as zero by zero.
vi.mock('recharts', async () => {
  const real = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...real,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 800,
        height: 400,
      }),
  };
});
import React from 'react';
import GenerationChart, { redispatchForPoint } from '../GenerationChart';
import { makePoint } from '../../test/factories';
import { RedispatchHour } from '../../utils/redispatch';
import { HOUR_MS } from '../../utils/constants';

const pad = (h: number) => String(h).padStart(2, '0');

/** 24 hourly points, `time` set consistently so a redispatch map keyed by
 * hourStartMs (= point.time - HOUR_MS) actually joins. */
const day = Array.from({ length: 24 }, (_, hour) => {
  const endMs = Date.UTC(2026, 7, 3, hour + 1);
  return makePoint({
    hourLabel: `${pad(hour)}:00`,
    endLabel: `${pad((hour + 1) % 24)}:00`,
    time: new Date(endMs),
    timeStr: `2026-08-03 ${pad((hour + 1) % 24)}:00:00`,
  });
});

function curtailedMap(hour: number, pvRed: number, windRed = 0): Map<number, RedispatchHour> {
  const hourStartMs = Date.UTC(2026, 7, 3, hour);
  return new Map([
    [
      hourStartMs,
      { hourStartMs, businessDate: '2026-08-03', pvRed, windRed },
    ],
  ]);
}

describe('GenerationChart — redispatch legend', () => {
  it('renders without the redispatch prop exactly as before: no curtailment legend entry', () => {
    render(<GenerationChart data={day} currentHourLabel="12:00" />);

    expect(screen.queryByText('Redysponowanie OZE')).not.toBeInTheDocument();
  });

  it('leaves the legend untouched when every hour of the map is zero', () => {
    render(
      <GenerationChart
        data={day}
        currentHourLabel="12:00"
        redispatch={curtailedMap(12, 0, 0)}
      />
    );

    expect(screen.queryByText('Redysponowanie OZE')).not.toBeInTheDocument();
  });

  it('adds the legend entry once any hour carries real curtailment', () => {
    render(
      <GenerationChart
        data={day}
        currentHourLabel="12:00"
        redispatch={curtailedMap(12, -1500)}
      />
    );

    expect(screen.getByText('Redysponowanie OZE')).toBeInTheDocument();
  });

});

describe('redispatchForPoint — the join', () => {
  const point = makePoint({ time: new Date(Date.UTC(2026, 7, 3, 13)) }); // block ends 13:00, so starts 12:00

  it('reads the bucket keyed at the START of the block, one hour before point.time', () => {
    const hourStartMs = Date.UTC(2026, 7, 3, 12);
    const map = new Map<number, RedispatchHour>([
      [hourStartMs, { hourStartMs, businessDate: '2026-08-03', pvRed: -1500, windRed: -20 }],
    ]);

    expect(redispatchForPoint(point, map)).toEqual({ pvRed: -1500, windRed: -20 });
  });

  it('does not fall for a map entry keyed at point.time itself (the END of the block)', () => {
    // The one join bug that would be invisible in a screenshot but wrong in
    // the data: reading the map at point.time directly, rather than
    // point.time - HOUR_MS, attributes an hour's curtailment to the row after it.
    const wrongKey = point.time.getTime();
    expect(wrongKey).not.toBe(point.time.getTime() - HOUR_MS);
    const map = new Map<number, RedispatchHour>([
      [wrongKey, { hourStartMs: wrongKey, businessDate: '2026-08-03', pvRed: -1500, windRed: 0 }],
    ]);

    expect(redispatchForPoint(point, map)).toEqual({ pvRed: null, windRed: null });
  });

  it('is null, not zero, when the map has no bucket at all for this hour (data not loaded / no such day)', () => {
    expect(redispatchForPoint(point, undefined)).toEqual({ pvRed: null, windRed: null });
    expect(redispatchForPoint(point, new Map())).toEqual({ pvRed: null, windRed: null });
  });
});
