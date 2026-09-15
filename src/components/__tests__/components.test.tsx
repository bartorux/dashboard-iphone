import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Header from '../Header';
import CurrentStatusCard from '../CurrentStatusCard';
import AlertsPanel from '../AlertsPanel';
import { AlertRange, PSEDataPoint, Settings, SystemStatus } from '../../types';
import { makePoint } from '../../test/factories';

const noop = () => {};

function renderHeader(
  connection: 'loading' | 'online' | 'cached' | 'error',
  connectionText: string,
  status: SystemStatus = 'ok',
  onRetry?: () => void
) {
  return render(
    <Header
      status={status}
      connection={connection}
      connectionText={connectionText}
      onToggleSettings={noop}
      onRetry={onRetry}
    />
  );
}

describe('Header', () => {
  it('never claims a live connection while showing cached data', () => {
    renderHeader('cached', 'Ostatnie dane z 20:15');

    expect(screen.getByText('Ostatnie dane z 20:15')).toBeInTheDocument();
    expect(screen.queryByText(/Połączono|Zaktualizowano/)).not.toBeInTheDocument();
  });

  it('offers settings and nothing that only pretends to work', () => {
    renderHeader('online', 'Zaktualizowano 20:15', 'alarm', vi.fn());

    expect(screen.getByText('ALARM')).toBeInTheDocument();
    // The bell used to sit here toggling only its own icon: every caller passed
    // force: true, so it silenced nothing. "Ponów" appears only in the error
    // state, where there is something to retry.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ustawienia' })).toBeInTheDocument();
  });

  // The bar used to stick in name only: see stickyHeader.test.ts for the parent.
  it('sticks to the top of the viewport', () => {
    const { container } = renderHeader('online', 'Zaktualizowano 20:15');
    const header = container.querySelector('header')!;
    expect(header.className).toMatch(/(^|\s)sticky(\s|$)/);
    expect(header.className).toMatch(/(^|\s)top-0(\s|$)/);
    expect(header.className).toMatch(/(^|\s)app-bar(\s|$)/);
  });

  describe('loading', () => {
    it('looks like loading, not like a system state, and says so once', () => {
      const { container } = renderHeader('loading', '', 'unknown');
      const header = container.querySelector('header')!;

      expect(screen.getByTestId('header-capsule')).toHaveTextContent('Ładowanie');
      expect(screen.getByTestId('header-spinner')).toBeInTheDocument();
      expect(screen.getByText('Pobieranie danych z PSE…')).toBeInTheDocument();
      // The cold start used to read "Brak danych · Brak danych do oceny ·
      // Pobieranie danych…" — three ways of saying one thing, two of them wrong.
      expect(header.textContent).not.toMatch(/Brak danych/);
      expect(header.textContent!.match(/Pobieranie/g)).toHaveLength(1);
      expect(screen.queryByTestId('header-connection')).not.toBeInTheDocument();
      expect(header.dataset.status).toBeUndefined();
    });

    it('does not colour a status computed from the cache before the fetch confirms it', () => {
      const { container } = renderHeader('loading', 'Ostatnie dane z 20:15', 'warn');

      expect(container.querySelector('header')!.dataset.status).toBeUndefined();
      expect(screen.queryByText('UWAGA')).not.toBeInTheDocument();
      expect(screen.getByTestId('header-capsule').className).toContain('bg-surface-3');
      expect(screen.getByText('Ostatnie dane z 20:15')).toBeInTheDocument();
    });
  });

  describe('error', () => {
    it('looks like an error, says it once, and offers a retry that works', () => {
      const onRetry = vi.fn();
      const { container } = renderHeader('error', '', 'unknown', onRetry);
      const header = container.querySelector('header')!;

      expect(screen.getByTestId('header-capsule')).toHaveTextContent('Offline');
      expect(screen.getByText('Brak połączenia z PSE')).toBeInTheDocument();
      expect(header.textContent).not.toMatch(/Brak danych/);
      expect(header.textContent!.match(/połączenia/g)).toHaveLength(1);
      expect(header.dataset.status).toBeUndefined();

      fireEvent.click(screen.getByRole('button', { name: 'Ponów' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('keeps the time of the last figures beside the retry when there is one', () => {
      renderHeader('error', 'Ostatnie dane z 20:15', 'unknown', noop);

      const line = screen.getByTestId('header-connection');
      expect(line).toHaveTextContent('Ostatnie dane z 20:15');
      expect(within(line).getByRole('button', { name: 'Ponów' })).toBeInTheDocument();
    });
  });

  describe('capsule', () => {
    const cases = [
      ['ok', 'OK', 'Najbliższe godziny w normie', 'bg-ok-soft', 'text-ok-text', 'bg-ok'],
      ['warn', 'UWAGA', 'Najbliższe godziny przy progu', 'bg-warn-soft', 'text-warn-text', 'bg-warn'],
      ['alarm', 'ALARM', 'Najbliższe godziny poniżej progu', 'bg-alarm-soft', 'text-alarm-text', 'bg-alarm'],
    ] as const;

    cases.forEach(([status, label, description, soft, text, dot]) => {
      it(`carries the ${status} colour in the capsule and the line only, and names the horizon`, () => {
        const { container } = renderHeader('online', 'Zaktualizowano 20:15', status);
        const header = container.querySelector('header')!;
        const capsule = screen.getByTestId('header-capsule');

        expect(capsule).toHaveTextContent(label);
        expect(capsule.className).toContain(soft);
        expect(capsule.className).toContain(text);
        expect(capsule.querySelector('span')!.className).toContain(dot);
        // The line under the bar (.app-bar[data-status] in App.css).
        expect(header.dataset.status).toBe(status);
        // The bar itself carries no status fill any more.
        expect(header.className).not.toMatch(/\bbg-(ok|warn|alarm|status-unknown)\b/);
        // The bar speaks about the next hours, not the hour in the card below.
        expect(screen.getByText(description)).toBeInTheDocument();
        expect(description).toMatch(/^Najbliższe godziny/);
      });
    });

    it('stays neutral, with no status line, when the next hours cannot be judged', () => {
      const { container } = renderHeader('online', 'Zaktualizowano 20:15', 'unknown');

      expect(container.querySelector('header')!.dataset.status).toBeUndefined();
      expect(screen.getByTestId('header-capsule').className).toContain('bg-surface-3');
      expect(screen.getByText('Najbliższe godziny bez odczytów')).toBeInTheDocument();
    });
  });

  describe('connection mark', () => {
    it('marks cached figures with the offline icon', () => {
      renderHeader('cached', 'Ostatnie dane z 20:15');
      expect(screen.getByTestId('header-connection').querySelector('svg')).not.toBeNull();
    });

    it('shows no mark at all while online', () => {
      renderHeader('online', 'Zaktualizowano 20:15');
      const line = screen.getByTestId('header-connection');
      expect(line.querySelector('svg')).toBeNull();
      expect(line.querySelector('.rounded-full')).toBeNull();
    });
  });

  it('draws the settings icon in the accent colour in every state', () => {
    (['loading', 'online', 'cached', 'error'] as const).forEach((connection) => {
      const { unmount } = renderHeader(connection, '', 'alarm', noop);
      const gear = screen.getByRole('button', { name: 'Ustawienia' });
      expect(gear.className).toMatch(/(^|\s)text-accent(\s|$)/);
      unmount();
    });
  });
});

describe('CurrentStatusCard', () => {
  const point = (reserve: number, required: number): PSEDataPoint =>
    makePoint({
      time: new Date('2026-08-03T19:00:00Z'),
      timeStr: '2026-08-03 21:00:00',
      period: '20 - 21',
      hourLabel: '20:00',
      endLabel: '21:00',
      reserve,
      required,
    });

  it('shows the margin with an explicit sign and both source values', () => {
    render(
      <CurrentStatusCard
        point={point(1897, 1900)}
        status="alarm"
        isStale={false}
      />
    );

    expect(screen.getByText(/-3/)).toBeInTheDocument();
    expect(screen.getByText('1897 MW')).toBeInTheDocument();
    expect(screen.getByText('1900 MW')).toBeInTheDocument();
    expect(screen.getByText('ALARM')).toBeInTheDocument();
    // The block runs 20:00-21:00; its stamp is 21:00, which is what the card
    // used to show — an hour ahead of the time it describes.
    expect(screen.getByText('godzina 20:00–21:00')).toBeInTheDocument();
  });

  it('flags cached data rather than presenting it as current', () => {
    render(
      <CurrentStatusCard point={point(3000, 1000)} status="ok" isStale />
    );

    expect(screen.getByText(/pamięci podręcznej/)).toBeInTheDocument();
  });

  it('degrades gracefully when there is no current period', () => {
    render(
      <CurrentStatusCard point={undefined} status="unknown" isStale={false} />
    );

    expect(screen.getByText('Brak odczytu')).toBeInTheDocument();
  });

  it('shows a skeleton on the first fetch of the session, before anything has arrived', () => {
    // firstLoad = isLoading && point == null — "Brak odczytu" here would be a
    // false answer: PSE has not been asked yet, this is not a confirmed gap.
    const { container } = render(
      <CurrentStatusCard point={undefined} status="unknown" isStale={false} isLoading />
    );

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Brak odczytu')).not.toBeInTheDocument();
  });

  it('never shows a skeleton on a refresh once a reading is already in state (no skeleton flash on refetch)', () => {
    // isLoading can be true again on any poll, but `point` is no longer null —
    // the figure must stay on screen rather than being replaced by a placeholder.
    const { container } = render(
      <CurrentStatusCard
        point={point(1897, 1900)}
        status="alarm"
        isStale={false}
        isLoading
      />
    );

    expect(screen.getByText('1897 MW')).toBeInTheDocument();
    expect(screen.getByText('1900 MW')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
  });

  // A refresh recolours the badge (ok -> alarm) but was otherwise silent to a
  // screen reader — nothing in the accessibility tree said the status had
  // changed. This is the only role="status" inside the card, so getByRole
  // finds it without disambiguation.
  it('announces the status badge to assistive technology and updates it live', () => {
    const { rerender } = render(
      <CurrentStatusCard point={point(3000, 1000)} status="ok" isStale={false} />
    );

    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('OK');
    expect(badge).toHaveAttribute('aria-live', 'polite');

    rerender(
      <CurrentStatusCard point={point(1897, 1900)} status="alarm" isStale={false} />
    );

    expect(screen.getByRole('status')).toHaveTextContent('ALARM');
  });
});

describe('AlertsPanel', () => {
  const range: AlertRange = {
    severity: 'red',
    from: '20:00',
    to: '23:00',
    worstDifference: -155,
    worstHour: '20:00',
    reserve: 1663,
    required: 1818,
    hours: 3,
  };

  it('renders a merged range as a single entry', () => {
    render(<AlertsPanel ranges={[range]} currentDayOffset={0} hasData />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('20:00–23:00')).toBeInTheDocument();
    expect(screen.getByText('3 godz.')).toBeInTheDocument();
    // Absorbed from the risky-hours block that used to repeat this section
    expect(screen.getByText(/o 20:00/)).toBeInTheDocument();
  });

  it('confirms an all-clear day instead of showing an empty list', () => {
    render(<AlertsPanel ranges={[]} currentDayOffset={1} hasData />);

    expect(screen.getByText('Brak alertów w tym dniu')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('does not present missing data as an all-clear', () => {
    render(<AlertsPanel ranges={[]} currentDayOffset={2} hasData={false} />);

    expect(screen.getByText('Brak danych dla tego dnia')).toBeInTheDocument();
    expect(screen.queryByText('Brak alertów w tym dniu')).not.toBeInTheDocument();
  });

  // w4: the hour range and the worst margin are the two numbers a reader
  // decides on, so they share one row (left edge / right edge) rather than
  // living in separate blocks — that pairing is the entire point of this form.
  it('keeps the hour range and the worst margin in the same row', () => {
    render(<AlertsPanel ranges={[range]} currentDayOffset={0} hasData />);

    const hourRange = screen.getByText('20:00–23:00');
    const margin = screen.getByText('-155 MW');
    expect(hourRange.parentElement).toBe(margin.parentElement);
  });

  it('carries both an icon and a text label for severity on every row', () => {
    const orange: AlertRange = {
      severity: 'orange',
      from: '10:00',
      to: '11:00',
      worstDifference: 40,
      worstHour: '10:00',
      reserve: 2140,
      required: 2100,
      hours: 1,
    };
    render(<AlertsPanel ranges={[range, orange]} currentDayOffset={0} hasData />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    items.forEach((item) => {
      // Color alone must never carry status: every row needs the icon AND
      // the word, not just the tinted background.
      expect(item.querySelector('svg')).toBeTruthy();
      expect(
        within(item).getByText(/^(Niedobór rezerwy|Poniżej progu|Blisko progu)$/)
      ).toBeInTheDocument();
    });
  });

  // w2 (etap 2, naprawa B): the red THRESHOLD is an early-warning line, not a
  // deficit — findAlerts routes a range at e.g. +227 MW into the red weight
  // too (difference <= redThreshold). Printing "Alarm" beside that positive
  // number read as a contradiction, so the row's word is reworded to match
  // STATUS_DESCRIPTION's own "poniżej progu" / "przy progu" vocabulary, with
  // a genuine deficit worded separately.
  it('words the red row as a threshold breach when the margin is still positive', () => {
    const stillPositive: AlertRange = {
      severity: 'red',
      from: '17:00',
      to: '18:00',
      worstDifference: 227,
      worstHour: '17:00',
      reserve: 2127,
      required: 1900,
      hours: 1,
    };
    render(<AlertsPanel ranges={[stillPositive]} currentDayOffset={0} hasData />);

    expect(screen.getByText('Poniżej progu')).toBeInTheDocument();
    expect(screen.queryByText('Niedobór rezerwy')).not.toBeInTheDocument();
    expect(screen.queryByText('Alarm')).not.toBeInTheDocument();
  });

  it('reserves "Niedobór rezerwy" for a red row where reserve actually falls under required', () => {
    // `range` above: reserve 1663 < required 1818, worstDifference -155.
    render(<AlertsPanel ranges={[range]} currentDayOffset={0} hasData />);

    expect(screen.getByText('Niedobór rezerwy')).toBeInTheDocument();
    expect(screen.queryByText('Poniżej progu')).not.toBeInTheDocument();
  });

  it('words the orange row as a threshold breach, never "Uwaga" beside the number', () => {
    const orange: AlertRange = {
      severity: 'orange',
      from: '10:00',
      to: '11:00',
      worstDifference: 40,
      worstHour: '10:00',
      reserve: 2140,
      required: 2100,
      hours: 1,
    };
    render(<AlertsPanel ranges={[orange]} currentDayOffset={0} hasData />);

    expect(screen.getByText('Blisko progu')).toBeInTheDocument();
    expect(screen.queryByText('Uwaga')).not.toBeInTheDocument();
  });

  it('adds the caption explaining the red threshold is an early warning, margin can be positive', () => {
    render(<AlertsPanel ranges={[range]} currentDayOffset={0} hasData />);

    expect(
      screen.getByText(/ostrzeżenie wyprzedzające.*margines może być jeszcze dodatni/)
    ).toBeInTheDocument();
  });

  // w1 (etap 2, naprawa A): the header pill used to be hardcoded bg-alarm +
  // white text (3.55:1 at 11px semibold, below the 4.5:1 floor) regardless of
  // which weight the day actually carried — an "Uwaga"-only day still showed
  // the red pill. Now one pill per weight actually present, each in the same
  // soft/-text idiom the rows below already use.
  it('gives the hour pill the weight actually present, in the soft/-text idiom (not a hardcoded red)', () => {
    const orangeOnly: AlertRange = {
      severity: 'orange',
      from: '10:00',
      to: '12:00',
      worstDifference: 40,
      worstHour: '10:00',
      reserve: 2140,
      required: 2100,
      hours: 2,
    };
    render(<AlertsPanel ranges={[orangeOnly]} currentDayOffset={0} hasData />);

    const pill = screen.getByText('2 godz.');
    expect(pill.className).toContain('bg-warn-soft');
    expect(pill.className).toContain('text-warn-text');
    expect(pill.className).not.toContain('bg-alarm');
  });

  it('shows two separate pills, one per weight, on a day carrying both', () => {
    const orange: AlertRange = {
      severity: 'orange',
      from: '10:00',
      to: '11:00',
      worstDifference: 40,
      worstHour: '10:00',
      reserve: 2140,
      required: 2100,
      hours: 1,
    };
    render(<AlertsPanel ranges={[range, orange]} currentDayOffset={0} hasData />);

    const redPill = screen.getByText('3 godz.');
    const orangePill = screen.getByText('1 godz.');
    expect(redPill.className).toContain('bg-alarm-soft');
    expect(redPill.className).toContain('text-alarm-text');
    expect(orangePill.className).toContain('bg-warn-soft');
    expect(orangePill.className).toContain('text-warn-text');
  });

  it('keeps reserve and required visible after the line was shortened', () => {
    render(<AlertsPanel ranges={[range]} currentDayOffset={0} hasData />);

    // Shortening the sentence for w4 must not drop a figure that used to be
    // in the old paragraph: reserve and required both still have to show up.
    expect(screen.getByText(/1663/)).toBeInTheDocument();
    expect(screen.getByText(/1818/)).toBeInTheDocument();
  });
});

describe('CurrentStatusCard — linia Kompasu', () => {
  const point = makePoint({ hourLabel: '20:00', endLabel: '21:00', reserve: 3000, required: 2000 });

  it('names the operator request in full while it covers this very hour', () => {
    render(
      <CurrentStatusCard
        point={point}
        status="ok"
        isStale={false}
        compassNow={{ level: 3, from: '19:00', to: '21:00', hours: 2 }}
      />
    );
    expect(screen.getByText(/Kompas Energetyczny PSE/)).toBeInTheDocument();
    // The operator's own wording, not a paraphrase — the reader has to be able
    // to match this against what PSE publishes.
    expect(screen.getByText(/wymagane ograniczenie poboru do 21:00/)).toBeInTheDocument();
  });

  it('says nothing when no request covers this hour', () => {
    /*
     * The card answers "right now". A flag on some other hour belongs to the
     * alerts card, which is about the whole day; repeating it here would turn
     * a card with one job into a second alert list.
     */
    render(<CurrentStatusCard point={point} status="ok" isStale={false} compassNow={null} />);
    expect(screen.queryByText(/Kompas/)).not.toBeInTheDocument();
  });
});
