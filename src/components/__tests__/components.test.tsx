import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Header from '../Header';
import CurrentStatusCard from '../CurrentStatusCard';
import AlertsPanel from '../AlertsPanel';
import SettingsPanel from '../SettingsPanel';
import { AlertRange, PSEDataPoint, Settings } from '../../types';
import { makePoint } from '../../test/factories';

const noop = () => {};

function renderHeader(
  connection: 'loading' | 'online' | 'cached' | 'error',
  connectionText: string
) {
  return render(
    <Header
      status="ok"
      connection={connection}
      connectionText={connectionText}
      onToggleSettings={noop}
    />
  );
}

describe('Header', () => {
  it('never claims a live connection while showing cached data', () => {
    renderHeader('cached', 'Dane z 20:15');

    expect(screen.getByText('Dane z 20:15')).toBeInTheDocument();
    expect(screen.queryByText(/Połączono/)).not.toBeInTheDocument();
  });

  it('shows the loading and error states', () => {
    const { unmount } = renderHeader('loading', 'Pobieranie danych…');
    expect(screen.getByText('Pobieranie danych…')).toBeInTheDocument();
    unmount();

    renderHeader('error', 'Brak danych z PSE');
    expect(screen.getByText('Brak danych z PSE')).toBeInTheDocument();
  });

  it('offers settings and nothing that only pretends to work', () => {
    render(
      <Header
        status="alarm"
        connection="online"
        connectionText="Zaktualizowano 20:15"
        onToggleSettings={noop}
      />
    );

    expect(screen.getByText('ALARM')).toBeInTheDocument();
    // The bell used to sit here toggling only its own icon: every caller passed
    // force: true, so it silenced nothing.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ustawienia' })).toBeInTheDocument();
  });

  // Etap 2, naprawa C: white text on --l-ok/--l-warn measured at 2.2:1 and on
  // --l-alarm at 3.55:1 — both below the 4.5:1 floor for the 11-17px semibold
  // text here. Ink is now three steps of black instead, with the bar's own
  // background colour (STATUS_HEADER_BG) untouched — this only asserts on the
  // text/dot classes, never on colour, since the fix must not move a pixel of
  // the status colour itself.
  (['ok', 'warn', 'alarm', 'unknown'] as const).forEach((status) => {
    it(`inks the ${status} bar in black, not white, on the label/description/connection line`, () => {
      const { container } = render(
        <Header
          status={status}
          connection="online"
          connectionText="Zaktualizowano 20:15"
          onToggleSettings={noop}
        />
      );

      const h1 = container.querySelector('h1')!;
      expect(h1.className).toContain('text-black');
      expect(h1.className).not.toContain('text-white');

      const description = screen.getByText(
        status === 'ok'
          ? 'Najbliższe godziny w normie'
          : status === 'warn'
            ? 'Najbliższe godziny przy progu'
            : status === 'alarm'
              ? 'Najbliższe godziny poniżej progu'
              : 'Brak danych do oceny'
      );
      expect(description.className).toContain('text-black/85');

      const connectionLine = screen.getByText('Zaktualizowano 20:15').parentElement!;
      expect(connectionLine.className).toContain('text-black/80');

      const dot = connectionLine.querySelector('span')!;
      expect(dot.className).toContain('bg-black/70');
      expect(dot.className).not.toMatch(/bg-white/);
    });
  });

  it('keeps the settings icon white (inherited), which the ink fix deliberately does not touch', () => {
    const { container } = render(
      <Header
        status="alarm"
        connection="online"
        connectionText="Zaktualizowano 20:15"
        onToggleSettings={noop}
      />
    );

    expect(container.querySelector('header')!.className).toContain('text-white');
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

describe('SettingsPanel — theme switch', () => {
  const settings: Settings = {
    orangeThreshold: 500,
    redThreshold: 300,
    version: 1,
  };

  const renderPanel = (theme: 'system' | 'light' | 'dark', onThemeChange = vi.fn()) => {
    render(
      <SettingsPanel
        visible
        settings={settings}
        theme={theme}
        onThemeChange={onThemeChange}
        onSave={() => null}
        onReset={noop}
        onNotification={noop}
        onClose={noop}
      />
    );
    return onThemeChange;
  };

  it('marks the active preference and offers all three', () => {
    renderPanel('dark');

    expect(screen.getByRole('radio', { name: 'Ciemny' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Jasny' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Systemowy' })).not.toBeChecked();
  });

  it('reports the chosen preference', () => {
    const onThemeChange = renderPanel('system');

    fireEvent.click(screen.getByRole('radio', { name: 'Jasny' }));

    expect(onThemeChange).toHaveBeenCalledWith('light');
  });
});

describe('SettingsPanel — thresholds', () => {
  const settings: Settings = {
    orangeThreshold: 500,
    redThreshold: 300,
    version: 1,
  };

  afterEach(() => vi.restoreAllMocks());

  it('keeps a cleared field empty instead of snapping back to the default', () => {
    render(
      <SettingsPanel
        visible
        settings={settings}
        theme="system"
        onThemeChange={noop}
        onSave={() => null}
        onReset={noop}
        onNotification={noop}
        onClose={noop}
      />
    );

    const field = screen.getByDisplayValue('500');
    fireEvent.change(field, { target: { value: '' } });

    expect(field).toHaveValue(null);
  });
});
