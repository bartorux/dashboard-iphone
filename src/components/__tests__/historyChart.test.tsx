import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Same workaround as reserveChart.test.tsx and generationChart.test.tsx:
// ResponsiveContainer measures its parent, which jsdom always reports as zero
// by zero, so a chart mounted without this renders no plot to assert on.
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
import HistoryChart, { HistoryTooltip } from '../HistoryChart';
import { makePoint } from '../../test/factories';
import { PSEDataPoint } from '../../types';
import { formatMW } from '../../utils/format';
import { niceScaleRange } from '../../utils/scale';
import { axisWidthFor, CHART_MARGIN } from '../chart/shared';

/**
 * The x-coordinate of every data point Recharts placed along a "monotone"
 * line curve — see the identical helper's comment in reserveChart.test.tsx.
 */
const curvePointsX = (d: string): number[] =>
  (d.match(/[MC][^MC]*/g) ?? []).map((command) => {
    const numbers = command.slice(1).split(',').map(Number);
    return numbers[numbers.length - 2];
  });

const pad = (h: number) => String(h).padStart(2, '0');

/** Three days of history, so every hour clears marginDistribution's
 * minSamples=3 and the chart actually draws a plot rather than the
 * "too little history" placeholder. */
const thirtyDayHistory: PSEDataPoint[] = ['2026-07-01', '2026-07-02', '2026-07-03'].flatMap(
  (businessDate) =>
    Array.from({ length: 24 }, (_, hour) =>
      makePoint({
        businessDate,
        hourLabel: `${pad(hour)}:00`,
        endLabel: `${pad((hour + 1) % 24)}:00`,
        reserve: 3000 + hour * 10,
        required: 2000,
      })
    )
);

const todayData: PSEDataPoint[] = Array.from({ length: 24 }, (_, hour) =>
  makePoint({
    businessDate: '2026-08-01',
    hourLabel: `${pad(hour)}:00`,
    endLabel: `${pad((hour + 1) % 24)}:00`,
    reserve: 3500,
    required: 2000,
  })
);

/**
 * A download that worked and a download that failed used to share one message,
 * with a retry button attached to both. Only one of them is worth pressing.
 */
const renderChart = (history: PSEDataPoint[], state: 'ready' | 'error') =>
  render(
    <HistoryChart
      dayData={[makePoint({ hourLabel: '19:00', reserve: 3000, required: 2000 })]}
      dayLabel="Dziś"
      days={30}
      history={history}
      state={state}
      onRetry={vi.fn()}
    />
  );

describe('HistoryChart — pusty rozkład a awaria', () => {
  it('does not blame the network for a history that is merely too short', () => {
    // Two days of readings: every hour holds a single sample, so no hour can
    // support a p10-p90 spread and the distribution comes back empty. The fetch
    // itself was fine, and retrying cannot change that.
    const krotkaHistoria = ['2026-07-01', '2026-07-02'].map((businessDate) =>
      makePoint({ businessDate, hourLabel: '19:00', reserve: 3000, required: 2000 })
    );

    renderChart(krotkaHistoria, 'ready');

    expect(screen.queryByText('Nie udało się pobrać historii')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).not.toBeInTheDocument();
    expect(screen.getByText(/Za mało dni w historii/)).toBeInTheDocument();
  });

  it('still offers a retry when the fetch genuinely failed', () => {
    renderChart([], 'error');

    expect(screen.getByText('Nie udało się pobrać historii')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument();
  });
});

describe('HistoryChart — siatka i linia zera', () => {
  /*
   * The last dashed grid in the app. It shared the `3 3` pattern with nothing
   * else, but the plot behind it already spends its dash budget on data — the
   * median line and (until this same change) the zero line both carry a
   * pattern — so a third dashed thing read as texture rather than chrome. A
   * regression here would silently bring the dash back without any visual
   * diff necessarily catching a hairline pattern at this scale.
   */
  it('draws the grid as solid lines, not dashed', () => {
    const { container } = render(
      <HistoryChart
        dayData={todayData}
        dayLabel="Dziś"
        days={30}
        history={thirtyDayHistory}
        state="ready"
        onRetry={vi.fn()}
      />
    );

    const gridLines = [
      ...container.querySelectorAll('.recharts-cartesian-grid line'),
    ];
    expect(gridLines.length).toBeGreaterThan(0);
    for (const line of gridLines) {
      expect(line).not.toHaveAttribute('stroke-dasharray');
    }
  });

  it('keeps the legend swatch for the median dashed, even though the grid is not', () => {
    render(
      <HistoryChart
        dayData={todayData}
        dayLabel="Dziś"
        days={30}
        history={thirtyDayHistory}
        state="ready"
        onRetry={vi.fn()}
      />
    );

    // getAllByText: the hour table beneath the chart carries its own "Mediana"
    // column header now (HourTable), so the legend's label is no longer unique
    // on the page — both are expected to exist.
    expect(screen.getAllByText('Mediana').length).toBeGreaterThan(0);
  });
});

describe('HistoryChart — tabela godzinowa zgadza się z dymkiem', () => {
  beforeEach(() => localStorage.clear());

  /*
   * Cross-check, not a copy — see the same test in reserveChart.test.tsx for
   * the full rationale. Median and the two band edges are used rather than
   * "Margines": that one field carries a "+" sign in the table but not in the
   * tooltip (an intentional, pre-existing asymmetry, same as GenerationChart's
   * "Wymiana" column), so it cannot supply one expected string usable against
   * both renderings. Median and the band edges have no such sign and format
   * identically in both places, in `thirtyDayHistory` all three days carry the
   * same reserve for a given hour, so p10 = p50 = p90 — one plain figure, easy
   * to check against both renderings without computing a percentile by hand.
   */
  it('shows the same median and band edges for an hour in the table as the tooltip prints', () => {
    const targetHourLabel = '05:00';
    const historyMargin = 3000 + 5 * 10 - 2000; // reserve − required at hour 05, all 3 days alike
    const expectedMedian = formatMW(historyMargin);
    const expectedBandLow = formatMW(historyMargin);
    const expectedBandHigh = formatMW(historyMargin);

    const tooltipRow = {
      key: targetHourLabel,
      band: [historyMargin, historyMargin] as [number, number],
      median: historyMargin,
      today: 1500,
      samples: 3,
    };
    const { container: tooltipContainer } = render(
      <HistoryTooltip active payload={[{ payload: tooltipRow } as never]} label={targetHourLabel} />
    );
    expect(tooltipContainer.textContent).toContain(expectedMedian);

    const { getByRole, container } = render(
      <HistoryChart
        dayData={todayData}
        dayLabel="Dziś"
        days={30}
        history={thirtyDayHistory}
        state="ready"
        onRetry={vi.fn()}
      />
    );
    fireEvent.click(getByRole('button', { name: 'Tabela godzinowa' }));
    const table = container.querySelector('table')!;
    const row = within(table).getByText(targetHourLabel).closest('tr')!;

    expect(row.textContent).toContain(expectedMedian);
    expect(row.textContent).toContain(expectedBandLow);
    expect(row.textContent).toContain(expectedBandHigh);
  });
});

describe('HistoryChart — doba pełna na osi (h/24, nie h/23)', () => {
  /*
   * Same fix, same test as reserveChart.test.tsx's identically-named
   * describe block — see that file for the measured 12.087px vs 11.583px
   * bug this closes. Reads the "today" line's actual drawn points rather
   * than trusting the source change to have worked.
   */
  it('spaces the 24 real hours across 24 equal steps, not 23', () => {
    const { container } = render(
      <HistoryChart
        dayData={todayData}
        dayLabel="Dziś"
        days={30}
        history={thirtyDayHistory}
        state="ready"
        onRetry={vi.fn()}
      />
    );
    const curves = [...container.querySelectorAll('.recharts-line-curve')];
    // Source order: median, then today — today is last.
    const todayCurve = curves[curves.length - 1];
    const xs = curvePointsX(todayCurve.getAttribute('d') ?? '');

    expect(xs).toHaveLength(25); // 24 real hours + the closing 24:00 row

    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 5);

    const left = axisWidthFor();
    const right = 800 - CHART_MARGIN.right;
    expect(gaps[0]).toBeCloseTo((right - left) / 24, 5);
  });

  it('keeps exactly the six axis ticks — the closing row never becomes a seventh', () => {
    const { container } = render(
      <HistoryChart
        dayData={todayData}
        dayLabel="Dziś"
        days={30}
        history={thirtyDayHistory}
        state="ready"
        onRetry={vi.fn()}
      />
    );
    const ticks = container.querySelectorAll(
      '.recharts-xAxis .recharts-cartesian-axis-tick'
    );
    expect(ticks).toHaveLength(6);
  });

  it('lists exactly 24 hours in the table, and never "24:00"', () => {
    localStorage.clear();
    const { getByRole, container } = render(
      <HistoryChart
        dayData={todayData}
        dayLabel="Dziś"
        days={30}
        history={thirtyDayHistory}
        state="ready"
        onRetry={vi.fn()}
      />
    );
    fireEvent.click(getByRole('button', { name: 'Tabela godzinowa' }));
    const table = container.querySelector('table')!;
    const bodyRows = within(table).getAllByRole('row').slice(1); // drop the header row

    expect(bodyRows).toHaveLength(24);
    expect(within(table).queryByText('24:00')).toBeNull();
  });

  /*
   * Hovering the sliver of plot between the real 23:00 point and the new
   * right edge resolves to the closing row. Without `tooltipHourKey`, that
   * would caption the tooltip "24:00" — a fourth hour nobody's data has.
   * Unlike Reserve/Generation, this tooltip prints only the hour, with no
   * end label, so the whole header is expected to read "23:00" either way.
   */
  it('announces the closing row\'s tooltip as 23:00, identical to the real 23:00 row', () => {
    const realRow = {
      key: '23:00',
      band: [1000, 1000] as [number, number],
      median: 1000,
      today: 1500,
      samples: 3,
    };
    const closingRow = { ...realRow, key: '24:00' };

    const { container: real } = render(
      <HistoryTooltip active payload={[{ payload: realRow } as never]} label={realRow.key} />
    );
    const { container: closing } = render(
      <HistoryTooltip
        active
        payload={[{ payload: closingRow } as never]}
        label={closingRow.key}
      />
    );

    expect(closing.textContent).toBe(real.textContent);
    expect(closing.textContent).toContain('23:00');
    expect(closing.textContent).not.toContain('24:00');
  });

  /*
   * The Y-axis domain is computed from the 24 real rows, never the 25-row
   * `chartRows` — see the component's own comment. Because the closing row
   * is always a plain copy of 23:00's values, feeding it into the scale
   * calculation too could never actually change the domain here; this pins
   * the axis to the same reading as before the closing row existed.
   */
  it('keeps the Y-axis scale exactly as it was before the closing row existed', () => {
    const { container } = render(
      <HistoryChart
        dayData={todayData}
        dayLabel="Dziś"
        days={30}
        history={thirtyDayHistory}
        state="ready"
        onRetry={vi.fn()}
      />
    );
    const gridLines = container.querySelectorAll('.recharts-cartesian-grid line');

    // `thirtyDayHistory`'s band/median run 1000 (hour 00) to 1230 (hour 23);
    // `todayData`'s margin is a flat 1500.
    const expected = niceScaleRange(1000, 1500);
    expect(gridLines).toHaveLength(expected.ticks.length);
  });
});
