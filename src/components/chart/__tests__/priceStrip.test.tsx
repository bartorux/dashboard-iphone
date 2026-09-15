import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

/*
 * Same fix as reserveChart.test.tsx: jsdom reports every element as zero by
 * zero, so ResponsiveContainer would otherwise render nothing to assert on.
 */
vi.mock('recharts', async () => {
  const real = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...real,
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
  shadeAt,
  shadeStops,
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
const LOW = '#3fa587';
const HIGH = '#084f3d';

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
  it('draws a confirmed day as one line and no band', () => {
    const { container, getByText } = render(<PriceStrip day={confirmedDay} />);

    expect(lineCurves(container)).toHaveLength(1);
    expect(areaCurves(container)).toHaveLength(0);
    expect(getByText('potwierdzona · TGE')).toBeInTheDocument();
  });

  it('draws a forecast day as a band with two edges and never a centre line', () => {
    const { container, getByText } = render(<PriceStrip day={forecastDay} />);

    // Exactly the band's own top and bottom edge — a middle "consensus" line
    // would show up as a third .recharts-line-curve here, which is precisely
    // the T2 requirement this asserts: a prediction must never draw like a
    // certainty.
    expect(lineCurves(container)).toHaveLength(2);
    expect(areaCurves(container)).toHaveLength(1);
    expect(getByText('prognoza D+2 · pewność niska')).toBeInTheDocument();

    // Counting is not enough: a series fed only nulls still renders its
    // element, just with nothing in it. Both edges must actually be drawn,
    // each with its own translucent gradient — never the confirmed line's
    // opaque one.
    for (const curve of lineCurves(container)) {
      expect(curve.getAttribute('d')).toMatch(/\d/);
      const opacities = gradientStops(container, curve.getAttribute('stroke')).map((stop) =>
        Number(stop.getAttribute('stop-opacity'))
      );
      expect(opacities.length).toBeGreaterThan(0);
      for (const opacity of opacities) expect(opacity).toBeLessThan(1);
    }
  });

  it('shades a confirmed line by price: deepest at its peak, lightest at its trough', () => {
    const { container } = render(<PriceStrip day={confirmedDay} />);
    const [line] = lineCurves(container);
    const stops = gradientStops(container, line.getAttribute('stroke'));
    // confirmedDay runs 800..1030 zł/MWh, top of the box first.
    expect(stops[0].getAttribute('stop-color')).toBe(shadeAt(1030, LOW, HIGH));
    expect(stops[stops.length - 1].getAttribute('stop-color')).toBe(shadeAt(800, LOW, HIGH));
    for (const stop of stops) expect(Number(stop.getAttribute('stop-opacity'))).toBe(1);
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

describe('price shade', () => {
  it('clamps to the two ends outside the anchors and mixes between them', () => {
    expect(shadeAt(PRICE_SHADE_LOW - 500, LOW, HIGH)).toBe(LOW);
    expect(shadeAt(PRICE_SHADE_HIGH + 900, LOW, HIGH)).toBe(HIGH);
    const middle = shadeAt((PRICE_SHADE_LOW + PRICE_SHADE_HIGH) / 2, LOW, HIGH);
    expect(middle).not.toBe(LOW);
    expect(middle).not.toBe(HIGH);
    // #3f→#08 red channel, halfway ≈ #24
    expect(middle.slice(1, 3)).toBe('24');
  });

  it('places a stop wherever an anchor falls inside the span, so the shade is exact at every height', () => {
    const stops = shadeStops(800, 2500, LOW, HIGH);
    expect(stops.map((stop) => stop.offset)).toEqual([0, (2500 - 1500) / 1700, 1]);
    expect(stops[0].color).toBe(HIGH);
    expect(stops[1].color).toBe(HIGH);
    expect(stops[2].color).toBe(shadeAt(800, LOW, HIGH));
  });

  it('spans both anchors on a day running from cheap to dear', () => {
    const stops = shadeStops(100, 2000, LOW, HIGH);
    expect(stops.map((stop) => stop.color)).toEqual([HIGH, HIGH, LOW, LOW]);
    expect(stops.map((stop) => stop.offset)).toEqual([0, 500 / 1900, 1750 / 1900, 1]);
  });

  it('gives no gradient to a flat span, which SVG would not paint at all', () => {
    expect(shadeStops(900, 900, LOW, HIGH)).toEqual([]);
  });

  it('falls back to the deep end when a token is not plain hex', () => {
    expect(shadeAt(300, 'rgb(1,2,3)', HIGH)).toBe(HIGH);
  });
});
