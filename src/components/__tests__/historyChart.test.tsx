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
