import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChartSection from '../ChartSection';
import { makePoint } from '../../test/factories';

const dayData = Array.from({ length: 24 }, (_, hour) =>
  makePoint({
    hourLabel: `${String(hour).padStart(2, '0')}:00`,
    endLabel: `${String((hour + 1) % 24).padStart(2, '0')}:00`,
    reserve: 2000 + hour * 10,
  })
);

function renderSection() {
  return render(
    <ChartSection
      dayData={dayData}
      dayLabel="Dziś"
      orangeThreshold={500}
      redThreshold={300}
      currentHourLabel="12:00"
      isLoading={false}
    />
  );
}

describe('ChartSection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: [] }) })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('offers all three readings of the same day', () => {
    renderSection();

    for (const label of ['Rezerwa', 'Generacja', 'Na tle 30 dni']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('tab', { name: 'Rezerwa' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('retitles the card to match the active view', () => {
    renderSection();

    expect(screen.getByText(/Rezerwa mocy/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Generacja' }));

    expect(screen.getByText(/Zapotrzebowanie i generacja/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Generacja' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('does not fetch history until the comparison is opened', async () => {
    renderSection();

    // Whoever never opens the comparison never pays for the transfer
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Na tle 30 dni' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(decodeURIComponent(String(vi.mocked(fetch).mock.calls[0][0]))).toContain(
      'business_date ge'
    );
  });

  it('does not fetch redispatch until the generation view is opened', async () => {
    renderSection();

    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Generacja' }));

    // Two lazy fetches belong to this view now: curtailment and the
    // country-wide demand behind the honest OZE percentage.
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const urls = vi
      .mocked(fetch)
      .mock.calls.map((call) => decodeURIComponent(String(call[0])));
    expect(urls.some((u) => u.includes('/poze-redoze?'))).toBe(true);
    expect(urls.some((u) => u.includes('/pdgobpkd?'))).toBe(true);
    for (const url of urls) {
      // dayData[0].businessDate from the shared factory
      expect(url).toContain("business_date eq '2026-08-03'");
    }
  });
});
