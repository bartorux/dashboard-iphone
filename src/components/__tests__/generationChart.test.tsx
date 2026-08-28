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
import GenerationChart, { GenerationTooltip, redispatchForPoint } from '../GenerationChart';
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

describe('frames of reference', () => {
  it('tooltip keeps the frames apart and carries no percentage', () => {
    // Rendered directly: the tooltip only exists on hover, so a chart-level
    // textContent check can never see what it prints — the first version of
    // this suite proved that by letting a reintroduced percentage through.
    const row = {
      key: '12:00', endLabel: '13:00', demand: 13186, pv: 11619, wind: 4931,
      outages: 3000, exchange: -4640, generation: 17826, pvRed: 0, windRed: 0,
    };
    const { container } = render(
      <GenerationTooltip active payload={[{ payload: row } as never]} label="12:00" />
    );
    // "(sieć)" and "(całk.)" name the two frames of reference as a matched
    // pair — the wording moved, the guarantee did not: grid figures and
    // country totals stay labelled apart, and no percentage is computed
    // across them.
    expect(container.textContent).toContain('Generacja (sieć)');
    expect(container.textContent).toContain('Zapotrzebowanie (sieć)');
    expect(container.textContent).toContain('Fotowoltaika (całk.)');
    expect(container.textContent).not.toContain('%');
    expect(container.textContent).not.toContain('Pozostałe');
  });


  /*
   * PV and wind arrive as COUNTRY TOTALS (micro-installations included) while
   * `generation` is grid units only — the two never subtract cleanly. The old
   * "Pozostałe" band did subtract them, erasing ~7 GW of conventional sources
   * at noon and putting a 93% OZE share on screen (measured 28.08.2026, 12:00:
   * PV 11 619 + wind 4 931 vs grid generation 17 826 → band of 1 276 MW where
   * thermal units alone ran 6 666 MW).
   */
  it('shows grid generation as a line and never a Pozostałe band', () => {
    render(<GenerationChart data={day} currentHourLabel="12:00" />);
    // The legend marks the frame on the line that gets confused with the OZE
    // stack; the tooltip above marks both. Either way grid figures stay
    // labelled apart from country totals.
    expect(screen.getByText('Generacja (sieć)')).toBeInTheDocument();
    expect(screen.getByText('Zapotrzebowanie')).toBeInTheDocument();
    expect(screen.queryByText('Pozostałe')).toBeNull();
  });

  it('never prints an OZE share computed across the two frames', () => {
    const { container } = render(<GenerationChart data={day} currentHourLabel="12:00" />);
    expect(container.textContent).not.toContain('Udział OZE');
  });
});

describe('GenerationChart — redispatch legend', () => {
  it('renders without the redispatch prop exactly as before: no curtailment legend entry', () => {
    render(<GenerationChart data={day} currentHourLabel="12:00" />);

    expect(screen.queryByText('Redysponowanie')).not.toBeInTheDocument();
  });

  it('leaves the legend untouched when every hour of the map is zero', () => {
    render(
      <GenerationChart
        data={day}
        currentHourLabel="12:00"
        redispatch={curtailedMap(12, 0, 0)}
      />
    );

    expect(screen.queryByText('Redysponowanie')).not.toBeInTheDocument();
  });

  it('adds the legend entry once any hour carries real curtailment', () => {
    render(
      <GenerationChart
        data={day}
        currentHourLabel="12:00"
        redispatch={curtailedMap(12, -1500)}
      />
    );

    // Shortened from "Redysponowanie OZE": the entry's own swatch is the PV
    // and wind pair, so the legend does not have to repeat in words what it
    // shows in colour. The tooltip row still spells it out in full.
    expect(screen.getByText('Redysponowanie')).toBeInTheDocument();
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
