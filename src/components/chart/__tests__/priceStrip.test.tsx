import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

/*
 * Same fix as reserveChart.test.tsx: jsdom reports every element as zero by
 * zero, so ResponsiveContainer would otherwise render nothing to assert on.
 */
/** What Recharts reports as the hovered row; jsdom cannot move a pointer over a plot. */
const hover = vi.hoisted(() => ({ label: undefined as string | undefined }));

vi.mock('recharts', async () => {
  const real = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...real,
    useActiveTooltipLabel: () => hover.label,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.cloneElement(children as React.ReactElement<{ width: number; height: number }>, {
        width: 800,
        height: 112,
      }),
  };
});
import React from 'react';
import PriceStrip, {
  PriceTooltip,
  priceScale,
  rampAt,
  fineRows,
  hourOfLabel,
  PRICE_SHADE_HIGH,
  PRICE_SHADE_LOW,
} from '../PriceStrip';
import { PriceDay, PriceHour } from '../../../utils/cenyTypes';

const confirmedHours: PriceHour[] = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  price: 800 + hour * 10,
  p10: null,
  p90: null,
}));

const forecastHours: PriceHour[] = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  price: 700 + hour * 10,
  p10: 500 + hour * 5,
  p90: 1000 + hour * 20,
}));

const confirmedDay: PriceDay = {
  date: '2026-08-04',
  source: 'confirmed',
  horizon: null,
  confidence: null,
  hours: confirmedHours,
};

const forecastDay: PriceDay = {
  date: '2026-08-05',
  source: 'forecast',
  horizon: 'D+2',
  confidence: 'low',
  hours: forecastHours,
};

// useChartColors falls back to these when jsdom has no stylesheet to read.
const RAMP = ['#d3f0e5', '#94d6be', '#46ab8b', '#177559', '#07402f'];

const bars = (container: HTMLElement) => [...container.querySelectorAll('rect[data-price-hour]')];

/** The <stop>s of the gradient a `url(#id)` paint points at. */
const gradientStops = (container: HTMLElement, paint: string | null) => {
  const id = /^url\(#(.+)\)$/.exec(paint ?? '')?.[1];
  if (!id) return [];
  return [...(container.querySelector(`[id="${id}"]`)?.querySelectorAll('stop') ?? [])];
};

const lineCurves = (container: HTMLElement) => [
  ...container.querySelectorAll('.recharts-line-curve'),
];
const areaCurves = (container: HTMLElement) => [
  ...container.querySelectorAll('.recharts-area-area'),
];

describe('PriceStrip', () => {
  it('draws a confirmed day as 24 hourly bars and no band', () => {
    const { container, getByText } = render(<PriceStrip day={confirmedDay} />);

    expect(bars(container)).toHaveLength(24);
    expect(areaCurves(container)).toHaveLength(0);
    // The one line there is only feeds the tooltip — it must never show.
    expect(lineCurves(container).map((curve) => curve.getAttribute('stroke'))).toEqual(['none']);
    expect(getByText('potwierdzona · TGE')).toBeInTheDocument();
  });

  it('colours each bar by its own price and spans the whole hour, in order', () => {
    const { container } = render(<PriceStrip day={confirmedDay} />);
    const all = bars(container);
    // confirmedDay runs 800 + 10·hour zł/MWh.
    all.forEach((bar, hour) => expect(bar.getAttribute('fill')).toBe(rampAt(800 + hour * 10, RAMP)));
    const xs = all.map((bar) => Number(bar.getAttribute('x')));
    const width = Number(all[0].getAttribute('width'));
    const step = xs[1] - xs[0];
    expect(width).toBeGreaterThan(step * 0.8);
    expect(width).toBeLessThan(step);
    xs.forEach((x, hour) => expect(x).toBeCloseTo(xs[0] + hour * step, 3));
    // A dearer hour stands taller: its top sits higher on the plot.
    expect(Number(all[23].getAttribute('y'))).toBeLessThan(Number(all[0].getAttribute('y')));

    // Hour 0 starts at the plot's left edge and hour 23 ends at its right one —
    // the same grid the reserve chart's hours sit on — and every bar stands on
    // the zero line, which is the plot's lowest grid line here.
    const grid = [...container.querySelectorAll('.recharts-cartesian-grid-horizontal line')];
    const left = Number(grid[0].getAttribute('x1'));
    const right = Number(grid[0].getAttribute('x2'));
    const zero = Math.max(...grid.map((line) => Number(line.getAttribute('y1'))));
    expect(xs[0] - left).toBeLessThan(1);
    expect(right - (xs[23] + width)).toBeLessThan(1);
    expect(right - (xs[23] + width)).toBeGreaterThanOrEqual(0);
    for (const bar of all) {
      expect(Number(bar.getAttribute('y')) + Number(bar.getAttribute('height'))).toBeCloseTo(zero, 3);
    }
  });

  it('draws a forecast day as a band with two edges, no bars and never a centre line', () => {
    const { container, getByText } = render(<PriceStrip day={forecastDay} />);

    // Exactly the band's own top and bottom edge — a middle "consensus" line
    // would show up as a third .recharts-line-curve here, which is precisely
    // the T2 requirement this asserts: a prediction must never draw like a
    // certainty.
    expect(bars(container)).toHaveLength(0);
    expect(lineCurves(container)).toHaveLength(2);
    expect(areaCurves(container)).toHaveLength(1);
    expect(getByText('prognoza D+2 · pewność niska')).toBeInTheDocument();

    const fill = gradientStops(container, areaCurves(container)[0].getAttribute('fill'));
    expect(fill.map((stop) => stop.getAttribute('stop-color'))).toEqual(RAMP);
    for (const stop of fill) expect(Number(stop.getAttribute('stop-opacity'))).toBeLessThan(1);

    // Both edges drawn, opaque, and from the ramp's deeper end only.
    for (const curve of lineCurves(container)) {
      expect(curve.getAttribute('d')).toMatch(/\d/);
      const edge = gradientStops(container, curve.getAttribute('stroke'));
      expect(edge.map((stop) => stop.getAttribute('stop-color'))).toEqual(RAMP.slice(2));
      for (const stop of edge) expect(Number(stop.getAttribute('stop-opacity'))).toBe(1);
    }
  });

  it('lays the band gradient out in absolute price, not per band', () => {
    const { container } = render(<PriceStrip day={forecastDay} />);
    const id = /^url\(#(.+)\)$/.exec(areaCurves(container)[0].getAttribute('fill') ?? '')?.[1];
    const gradient = container.querySelector(`[id="${id}"]`);
    expect(gradient?.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    // 1500 zł/MWh sits above 250 on the plot, so y2 < y1.
    expect(Number(gradient?.getAttribute('y2'))).toBeLessThan(Number(gradient?.getAttribute('y1')));
  });

  describe('hovered hour', () => {
    afterEach(() => {
      hover.label = undefined;
    });

    const ring = (container: HTMLElement) => container.querySelector('rect[data-price-active]');

    it('rings the bar under the pointer, like the OZE strip, and nothing else', () => {
      const { container, rerender } = render(<PriceStrip day={confirmedDay} />);
      expect(ring(container)).toBeNull();

      // 07:40 is the right half of the 07:00 bar — still that bar, not 08:00.
      hover.label = '07:40';
      rerender(<PriceStrip day={{ ...confirmedDay }} />);
      const marked = ring(container);
      expect(marked?.getAttribute('data-price-active')).toBe('7');
      expect(marked?.getAttribute('fill')).toBe('none');

      const bar = bars(container)[7];
      const x = Number(bar.getAttribute('x'));
      const w = Number(bar.getAttribute('width'));
      const rx = Number(marked?.getAttribute('x'));
      const rw = Number(marked?.getAttribute('width'));
      // Just outside the bar on both sides, clear of it by a small gap.
      expect(rx).toBeLessThan(x - 1);
      expect(rx + rw).toBeGreaterThan(x + w + 1);
      expect(rx + rw - (x + w)).toBeLessThan(4);
    });

    it('drops the ring when a touch reader closes the tooltip, and brings it back on the next tap', () => {
      hover.label = '07:40';
      const { container } = render(<PriceStrip day={confirmedDay} />);
      const strip = container.querySelector('.price-strip-h') as HTMLElement;

      // First touch hands the tooltip to useDismissibleTooltip, closed.
      fireEvent.touchStart(strip, { touches: [{ clientX: 10, clientY: 10 }] });
      expect(ring(container)).toBeNull();

      // A tap (no movement) opens it — and the ring with it.
      fireEvent.touchEnd(strip);
      expect(ring(container)).not.toBeNull();
    });

    it('never rings anything on a forecast day, which has no bars', () => {
      hover.label = '19:00';
      const { container } = render(<PriceStrip day={forecastDay} />);
      expect(ring(container)).toBeNull();
    });
  });

  it('translates every confidence level', () => {
    const { getByText } = render(
      <PriceStrip day={{ ...forecastDay, confidence: 'medium' }} />
    );
    expect(getByText('prognoza D+2 · pewność średnia')).toBeInTheDocument();
  });

  it('names the source under the strip', () => {
    const { getByText } = render(<PriceStrip day={confirmedDay} />);
    expect(getByText(/^ceny: pradcast\.pl/)).toBeInTheDocument();
  });

  it.each([
    ['23 hours (spring DST)', confirmedHours.slice(0, 23)],
    ['25 hours (autumn DST)', [...confirmedHours, confirmedHours[23]]],
  ])('renders nothing for a day of %s rather than guess a wrong axis', (_label, hours) => {
    const { container } = render(
      <PriceStrip day={{ ...confirmedDay, hours: hours as PriceHour[] }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PriceTooltip', () => {
  const confirmedRow = {
    key: '19:00',
    endLabel: '20:00',
    price: 2242,
    band: null,
    bandTop: null,
    bandBottom: null,
  };

  const forecastRow = {
    key: '19:00',
    endLabel: '20:00',
    price: null,
    band: [695, 2603] as [number, number],
    bandTop: 2603,
    bandBottom: 695,
  };

  it('shows the hour and price for a confirmed hour', () => {
    const { getByText } = render(
      <PriceTooltip active confirmed payload={[{ payload: confirmedRow }]} />
    );
    expect(getByText(/19:00/)).toBeInTheDocument();
    expect(getByText('2242 zł/MWh')).toBeInTheDocument();
  });

  it('shows a p10-p90 range for a forecast hour, with no single price', () => {
    const { getByText, queryByText } = render(
      <PriceTooltip active confirmed={false} payload={[{ payload: forecastRow }]} />
    );
    expect(getByText('695–2603 zł/MWh')).toBeInTheDocument();
    // Nothing here should let the model's own central estimate slip back in
    // through the one place T2 does not otherwise show it.
    expect(queryByText(/1240/)).not.toBeInTheDocument();
  });

  it('names the hour block, not the five-minute row, on a confirmed day', () => {
    const { getByText } = render(
      <PriceTooltip
        active
        confirmed
        payload={[{ payload: { ...confirmedRow, key: '19:35', hourLabel: '19:00' } }]}
      />
    );
    expect(getByText('19:00–20:00')).toBeInTheDocument();
  });

  it('renders nothing while inactive', () => {
    const { container } = render(
      <PriceTooltip active={false} confirmed payload={[{ payload: confirmedRow }]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('priceScale', () => {
  it.each([
    // [lowest, highest, expected ticks] — live 14–17.09.2026 ranges included
    [212, 2500, [0, 1000, 2000, 3000]],
    [380, 2242, [0, 1000, 2000, 3000]],
    [150, 1300, [0, 500, 1000, 1500]],
    [0, 0, [0, 1]],
    [-120, 900, [-500, 0, 500, 1000]],
  ])('labels %s–%s as %j', (lo, hi, ticks) => {
    const scale = priceScale(lo, hi);
    expect(scale.ticks).toEqual(ticks);
    expect(scale.min).toBe(ticks[0]);
    expect(scale.max).toBe(ticks[ticks.length - 1]);
    expect(scale.ticks).toContain(0);
  });
});

describe('fineRows and hourOfLabel', () => {
  const hourly = confirmedHours.map((h) => ({
    key: `${String(h.hour).padStart(2, '0')}:00`,
    endLabel: `${String((h.hour + 1) % 24).padStart(2, '0')}:00`,
    price: h.price,
    band: null,
    bandTop: null,
    bandBottom: null,
  }));

  it('gives every hour twelve rows, keeps the full-hour keys and names the block', () => {
    const fine = fineRows(hourly);
    expect(fine).toHaveLength(24 * 12);
    expect(new Set(fine.map((row) => row.key)).size).toBe(fine.length);
    // Full hours sit at every 12th row, so the hour grid is untouched.
    fine.forEach((row, i) => {
      const hour = Math.floor(i / 12);
      expect(row.hourLabel).toBe(hourly[hour].key);
      expect(row.price).toBe(hourly[hour].price);
      if (i % 12 === 0) expect(row.key).toBe(hourly[hour].key);
    });
    expect(fine[12 * 19 + 7].key).toBe('19:35');
  });

  it.each([
    ['19:35', 19],
    ['19:00', 19],
    ['00:05', 0],
    ['24:00', 23],
    [undefined, null],
    ['x', null],
  ])('reads %s as hour %s', (label, hour) => {
    expect(hourOfLabel(label)).toBe(hour);
  });
});

describe('rampAt', () => {
  it('clamps to the palest and deepest step outside the anchors', () => {
    expect(rampAt(PRICE_SHADE_LOW - 500, RAMP)).toBe(RAMP[0]);
    expect(rampAt(PRICE_SHADE_HIGH + 900, RAMP)).toBe(RAMP[4]);
  });

  it('lands exactly on each step at evenly spaced prices', () => {
    const span = PRICE_SHADE_HIGH - PRICE_SHADE_LOW;
    RAMP.forEach((color, i) => expect(rampAt(PRICE_SHADE_LOW + (span * i) / 4, RAMP)).toBe(color));
  });

  it('mixes between neighbouring steps, not across the whole ramp', () => {
    const span = PRICE_SHADE_HIGH - PRICE_SHADE_LOW;
    // Halfway between step 0 (#d3…) and step 1 (#94…): red channel ≈ #b4.
    expect(rampAt(PRICE_SHADE_LOW + span / 8, RAMP).slice(1, 3)).toBe('b4');
  });

  it('falls back to the deepest step when a token is not plain hex', () => {
    expect(rampAt(300, ['rgb(1,2,3)', ...RAMP.slice(1)])).toBe(RAMP[4]);
  });
});
