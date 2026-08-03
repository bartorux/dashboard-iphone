import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from '../Header';
import CurrentStatusCard from '../CurrentStatusCard';
import AlertsPanel from '../AlertsPanel';
import { AlertRange, PSEDataPoint } from '../../types';

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
