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
        height: 76,
      }),
  };
});
import React from 'react';
import PriceStrip, { PriceTooltip } from '../PriceStrip';
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
    // and in the band's edge colour, never in the confirmed line's.
    const confirmedStroke = lineCurves(render(<PriceStrip day={confirmedDay} />).container)[0]
      .getAttribute('stroke');
    for (const curve of lineCurves(container)) {
      expect(curve.getAttribute('d')).toMatch(/\d/);
      expect(curve.getAttribute('stroke')).not.toBe(confirmedStroke);
    }
  });

  it('translates every confidence level', () => {
    const { getByText } = render(
      <PriceStrip day={{ ...forecastDay, confidence: 'medium' }} />
    );
    expect(getByText('prognoza D+2 · pewność średnia')).toBeInTheDocument();
  });

  it('names the source under the strip', () => {
    const { getByText } = render(<PriceStrip day={confirmedDay} />);
    expect(getByText('ceny: pradcast.pl')).toBeInTheDocument();
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
