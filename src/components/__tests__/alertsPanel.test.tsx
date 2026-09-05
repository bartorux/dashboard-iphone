import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AlertsPanel from '../AlertsPanel';
import { AlertRange } from '../../types';
import { CompassRange } from '../../utils/compass';

function alertRange(overrides: Partial<AlertRange> = {}): AlertRange {
  return {
    severity: 'red',
    from: '19:00',
    to: '21:00',
    worstDifference: -100,
    worstHour: '20:00',
    reserve: 1000,
    required: 1100,
    hours: 2,
    ...overrides,
  };
}

function compassRange(overrides: Partial<CompassRange> = {}): CompassRange {
  return { level: 2, from: '19:00', to: '21:00', hours: 2, ...overrides };
}

const COMPASS_HEADING = 'Kompas Energetyczny PSE';

describe('AlertsPanel — Kompas Energetyczny PSE', () => {
  it('alerty + Kompas: pokazuje liste alertow, kreske i blok kompasu, w tej kolejnosci', () => {
    const { container } = render(
      <AlertsPanel
        ranges={[alertRange()]}
        currentDayOffset={0}
        hasData
        compassRanges={[compassRange({ from: '12:00', to: '14:00' })]}
      />
    );

    expect(screen.getByText('19:00–21:00')).toBeInTheDocument();
    expect(screen.getByText('12:00–14:00')).toBeInTheDocument();
    const heading = screen.getByText(COMPASS_HEADING);
    expect(heading).toBeInTheDocument();
    // Separated from the alert list by a thin rule, not folded into it.
    expect(heading.closest('div')?.className).toContain('border-t');

    // Document order: the alert row's DOM node comes before the compass block.
    const alertRow = container.querySelector('li')!;
    expect(
      alertRow.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('Kompas bez alertow: pokazuje zielona linie ORAZ blok kompasu, w tej kolejnosci', () => {
    render(
      <AlertsPanel
        ranges={[]}
        currentDayOffset={1}
        hasData
        compassRanges={[compassRange({ level: 3, from: '12:00', to: '14:00' })]}
      />
    );

    const okLine = screen.getByText('Brak alertów w tym dniu');
    const heading = screen.getByText(COMPASS_HEADING);
    expect(okLine).toBeInTheDocument();
    expect(heading).toBeInTheDocument();
    expect(
      okLine.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('alerty bez Kompasu: dziala jak dawniej, bloku nie ma', () => {
    render(
      <AlertsPanel
        ranges={[alertRange()]}
        currentDayOffset={0}
        hasData
        compassRanges={[]}
      />
    );

    expect(screen.getByText('19:00–21:00')).toBeInTheDocument();
    expect(screen.queryByText(COMPASS_HEADING)).not.toBeInTheDocument();
  });

  it('brak danych Kompasu (prop pominiety): domyslnie nic sie nie renderuje', () => {
    render(
      <AlertsPanel ranges={[alertRange()]} currentDayOffset={0} hasData />
    );
    expect(screen.queryByText(COMPASS_HEADING)).not.toBeInTheDocument();
  });

  it('brak danych PSE dla dnia: kompas sie nie pojawia, nawet jesli sa dla niego dane', () => {
    render(
      <AlertsPanel
        ranges={[]}
        currentDayOffset={0}
        hasData={false}
        compassRanges={[compassRange()]}
      />
    );
    expect(screen.getByText('Brak danych dla tego dnia')).toBeInTheDocument();
    expect(screen.queryByText(COMPASS_HEADING)).not.toBeInTheDocument();
  });

  it('ta sama godzina w alercie i w Kompasie: dwa osobne wiersze, swiadomie niescalone', () => {
    const { container } = render(
      <AlertsPanel
        ranges={[alertRange({ from: '19:00', to: '21:00' })]}
        currentDayOffset={0}
        hasData
        compassRanges={[compassRange({ from: '19:00', to: '21:00' })]}
      />
    );

    // The hour range text appears twice: once in the alert row, once in the
    // compass row — never merged into a single row that would claim a link
    // the data does not carry.
    expect(screen.getAllByText('19:00–21:00')).toHaveLength(2);
    // The severity row and the compass row are still separate list items.
    expect(container.querySelectorAll('li')).toHaveLength(2);
    // The compass row carries its own label; nothing in the alert row does.
    expect(screen.getByText('zalecane oszczędzanie')).toBeInTheDocument();
  });
});
