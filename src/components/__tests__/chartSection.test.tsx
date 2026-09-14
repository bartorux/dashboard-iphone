import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChartSection from '../ChartSection';
import { makePoint } from '../../test/factories';
import { visibleBusinessDates } from '../../utils/dayWindow';
import { PricesFile } from '../../utils/cenyTypes';

const dayData = Array.from({ length: 24 }, (_, hour) =>
  makePoint({
    hourLabel: `${String(hour).padStart(2, '0')}:00`,
    endLabel: `${String((hour + 1) % 24).padStart(2, '0')}:00`,
    reserve: 2000 + hour * 10,
  })
);

// makePoint's own default — spelled out here once so the price fixtures
// below can say plainly which day they do or do not cover.
const DAY_ON_SCREEN = '2026-08-03';

const pricesFor = (date: string): PricesFile => ({
  changedAt: '2026-08-03T10:00:00Z',
  source: 'pradcast.pl',
  days: [
    {
      date,
      source: 'confirmed',
      horizon: null,
      confidence: null,
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        price: 800 + hour,
        p10: null,
        p90: null,
      })),
    },
  ],
});

/**
 * Every call in this file's default fetch mock resolves the same generic PSE
 * shape regardless of URL — {@link ChartSection}'s own `usePrices()` call
 * asks for ceny.json alongside it, gets that same shape back, fails
 * usePrices' validation (no `days`, no `changedAt`) and quietly resolves to
 * "no prices", exactly like a 404 would. `pricesFor`/`callsTo` below are for
 * the tests that need to control what ceny.json actually answers.
 */
function mockFetch(cenyResponse: unknown = { value: [] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      const body = url.includes('ceny.json') ? cenyResponse : { value: [] };
      return Promise.resolve({ ok: true, json: async () => body });
    })
  );
}

const callsTo = (substring: string) =>
  vi.mocked(fetch).mock.calls.filter(([url]) =>
    decodeURIComponent(String(url)).includes(substring)
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
      kseDemand={new Map()}
    />
  );
}

describe('ChartSection', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
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

    // Whoever never opens the comparison never pays for the transfer. ceny.json
    // (usePrices, unconditional — see ChartSection's own comment) is allowed
    // to have been asked for already; only the history endpoint is gated.
    expect(callsTo('business_date ge')).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Na tle 30 dni' }));

    await waitFor(() => expect(callsTo('business_date ge')).toHaveLength(1));
  });

  it('does not fetch redispatch until the generation view is opened', async () => {
    renderSection();

    expect(callsTo('/poze-redoze?')).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Generacja' }));

    // Only curtailment is ChartSection's own fetch now. The country-wide
    // demand behind the honest OZE percentage moved to App — RenewableMixCard
    // needs that same map whether or not this view is ever opened, and a
    // second `useKseDemand` call here would fetch pdgobpkd twice for one
    // business date. See the `kseDemand` prop doc on ChartSectionProps.
    //
    // One call per visible day plus the day on screen (the factory's
    // 2026-08-03 lies outside today's window): the hook warms every tab the
    // moment the view opens, so a later day switch finds its curtailment in
    // the cache instead of drawing the chart twice. See useRedispatch.
    const expected = new Set([...visibleBusinessDates(new Date()), '2026-08-03']);
    await waitFor(() => expect(callsTo('/poze-redoze?')).toHaveLength(expected.size));
    const urls = callsTo('/poze-redoze?').map((call) => decodeURIComponent(String(call[0])));
    expect(urls.some((u) => u.includes('/pdgobpkd?'))).toBe(false);
    for (const date of expected) {
      expect(urls.some((u) => u.includes(`business_date eq '${date}'`))).toBe(true);
    }
  });

  it('renders the generation view off the kseDemand prop alone, with no fetch of its own', async () => {
    // A non-empty map passed in without any queued fetch response: if this
    // component still called useKseDemand itself, the mocked fetch above
    // would resolve `{ value: [] }` and silently empty the map back out —
    // the render would look the same either way, so the assertion has to be
    // "no fetch happened", not "the chart shows a number".
    render(
      <ChartSection
        dayData={dayData}
        dayLabel="Dziś"
        orangeThreshold={500}
        redThreshold={300}
        currentHourLabel="12:00"
        isLoading={false}
        kseDemand={new Map([[Date.UTC(2026, 7, 3, 11), 20000]])}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Generacja' }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    // Every call is redispatch; pdgobpkd never appears, confirming the
    // prop — not a second hook — is this map's only way in.
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some((call) => decodeURIComponent(String(call[0])).includes('pdgobpkd'))
    ).toBe(false);
  });

  describe('price strip', () => {
    it('shows the price strip under the reserve view when ceny.json covers the day on screen', async () => {
      mockFetch(pricesFor(DAY_ON_SCREEN));
      renderSection();

      expect(await screen.findByText('Cena energii')).toBeInTheDocument();
      expect(screen.getByText('potwierdzona · TGE')).toBeInTheDocument();
    });

    it('shows nothing at all when ceny.json has no entry for the day on screen', async () => {
      mockFetch(pricesFor('2026-08-09')); // any date other than DAY_ON_SCREEN
      renderSection();

      // Give the fetch a turn to resolve before asserting its absence.
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      await new Promise((done) => setTimeout(done, 0));

      expect(screen.queryByText('Cena energii')).not.toBeInTheDocument();
    });

    it('picks the day on screen by date, not the first day in the file', async () => {
      const today = pricesFor('2026-08-02').days[0];
      const shown = {
        ...pricesFor(DAY_ON_SCREEN).days[0],
        source: 'forecast' as const,
        horizon: 'D+2' as const,
        confidence: 'low' as const,
      };
      mockFetch({ ...pricesFor(DAY_ON_SCREEN), days: [today, shown] });
      renderSection();

      expect(await screen.findByText('prognoza D+2 · pewność niska')).toBeInTheDocument();
      expect(screen.queryByText('potwierdzona · TGE')).not.toBeInTheDocument();
    });

    it('hides the strip outside the reserve view', async () => {
      mockFetch(pricesFor(DAY_ON_SCREEN));
      renderSection();
      await screen.findByText('Cena energii');

      fireEvent.click(screen.getByRole('tab', { name: 'Generacja' }));
      expect(screen.queryByText('Cena energii')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: 'Na tle 30 dni' }));
      expect(screen.queryByText('Cena energii')).not.toBeInTheDocument();
    });
  });
});
