import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../Header';
import CurrentStatusCard from '../CurrentStatusCard';
import AlertsPanel from '../AlertsPanel';
import SettingsPanel from '../SettingsPanel';
import { AlertRange, PSEDataPoint, Settings } from '../../types';

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
      notificationsSilenced={false}
      onToggleNotifications={noop}
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

  it('exposes the notification toggle as a labelled control', () => {
    const onToggle = vi.fn();
    render(
      <Header
        status="alarm"
        connection="online"
        connectionText="Zaktualizowano 20:15"
        notificationsSilenced
        onToggleNotifications={onToggle}
        onToggleSettings={noop}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Włącz powiadomienia' })
    ).toBeInTheDocument();
    expect(screen.getByText('ALARM')).toBeInTheDocument();
  });
});

describe('CurrentStatusCard', () => {
  const point = (reserve: number, required: number): PSEDataPoint => ({
    time: new Date('2026-08-03T19:00:00Z'),
    timeStr: '2026-08-03 21:00:00',
    businessDate: '2026-08-03',
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
});

describe('AlertsPanel', () => {
  const range: AlertRange = {
    severity: 'red',
    from: '20:00',
    to: '23:00',
    worstDifference: -155,
    reserve: 1663,
    required: 1818,
    hours: 3,
  };

  it('renders a merged range as a single entry', () => {
    render(<AlertsPanel ranges={[range]} currentDayOffset={0} hasData />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('20:00–23:00')).toBeInTheDocument();
    expect(screen.getByText('3 godz.')).toBeInTheDocument();
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
    disableUpdates: false,
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
    disableUpdates: false,
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
