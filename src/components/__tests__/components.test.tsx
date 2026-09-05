import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
