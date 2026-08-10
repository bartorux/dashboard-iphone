import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HistoryChart from '../HistoryChart';
import { makePoint } from '../../test/factories';
import { PSEDataPoint } from '../../types';

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
