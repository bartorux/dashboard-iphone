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

const EXCHANGE_SENTENCE =
  /Saldo wymiany na tę dobę nie jest jeszcze zaplanowane/;

describe('AlertsPanel — zastrzeżenie o niezaplanowanym saldzie wymiany', () => {
  it('domyślnie (prop pominięty) nic nie pokazuje', () => {
    render(<AlertsPanel ranges={[]} currentDayOffset={0} hasData />);
    expect(screen.queryByText(EXCHANGE_SENTENCE)).not.toBeInTheDocument();
  });

  it('exchangeMissing={false}: zdanie się nie pojawia', () => {
    render(
      <AlertsPanel
        ranges={[alertRange()]}
        currentDayOffset={0}
        hasData
        exchangeMissing={false}
      />
    );
    expect(screen.queryByText(EXCHANGE_SENTENCE)).not.toBeInTheDocument();
  });

  it('exchangeMissing={true} bez alertów: zdanie widoczne, pod zieloną linią i nad Kompasem', () => {
    render(
      <AlertsPanel
        ranges={[]}
        currentDayOffset={2}
        hasData
        exchangeMissing
        compassRanges={[compassRange({ from: '12:00', to: '14:00' })]}
      />
    );

    const okLine = screen.getByText('Brak alertów w tym dniu');
    const note = screen.getByText(EXCHANGE_SENTENCE);
    const heading = screen.getByText(COMPASS_HEADING);

    expect(
      okLine.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      note.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('exchangeMissing={true} z alertami: zdanie widoczne pod listą alertów, nad Kompasem', () => {
    const { container } = render(
      <AlertsPanel
        ranges={[alertRange()]}
        currentDayOffset={2}
        hasData
        exchangeMissing
        compassRanges={[compassRange({ from: '12:00', to: '14:00' })]}
      />
    );

    const alertRow = container.querySelector('li')!;
    const note = screen.getByText(EXCHANGE_SENTENCE);
    const heading = screen.getByText(COMPASS_HEADING);

    expect(
      alertRow.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      note.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('brak danych PSE dla dnia: zdanie się nie pojawia, nawet gdy exchangeMissing jest true', () => {
    render(
      <AlertsPanel
        ranges={[]}
        currentDayOffset={2}
        hasData={false}
        exchangeMissing
      />
    );
    expect(screen.getByText('Brak danych dla tego dnia')).toBeInTheDocument();
    expect(screen.queryByText(EXCHANGE_SENTENCE)).not.toBeInTheDocument();
  });
});

/**
 * Extracts the calc(...) percentage a window's bar is positioned/sized with,
 * tolerant of the exact float formatting JS produces for e.g. 19/24*100.
 */
function calcPercent(value: string): number {
  const match = value.match(/calc\((-?[\d.]+)%/);
  if (!match) throw new Error(`no calc() percentage in: ${value}`);
  return parseFloat(match[1]);
}

describe('AlertsPanel — pasek doby', () => {
  it('brak okien alertowych: paska nie ma wcale', () => {
    render(<AlertsPanel ranges={[]} currentDayOffset={0} hasData />);
    expect(document.querySelector('[data-os-doby]')).not.toBeInTheDocument();
  });

  it('jedno okno: jeden pasek, aria-hidden na torze, pozycja i szerokość z godzin', () => {
    render(
      <AlertsPanel
        ranges={[alertRange({ severity: 'red', from: '19:00', hours: 2 })]}
        currentDayOffset={0}
        hasData
      />
    );

    const track = document.querySelector('[data-os-doby]');
    expect(track).toBeInTheDocument();
    // Status is already said in the text rows below — the track only adds
    // WHERE, so a screen reader must not see it as separate content.
    expect(track).toHaveAttribute('aria-hidden');

    const bars = track!.querySelectorAll('.bg-alarm, .bg-warn');
    expect(bars).toHaveLength(1);

    const bar = bars[0] as HTMLElement;
    // 19:00 for 2 hours -> left = 19/24 = 79.17%, width = 2/24 = 8.33%.
    expect(calcPercent(bar.style.left)).toBeCloseTo(79.17, 1);
    expect(calcPercent(bar.style.width)).toBeCloseTo(8.33, 1);
  });

  it('alarm wypełnia cały pasek, uwaga jest wcięta — drugi kanał obok barwy', () => {
    render(
      <AlertsPanel
        ranges={[
          alertRange({ severity: 'red', from: '08:00', hours: 1 }),
          alertRange({ severity: 'orange', from: '19:00', hours: 2 }),
        ]}
        currentDayOffset={0}
        hasData
      />
    );

    const track = document.querySelector('[data-os-doby]')!;
    const alarmBar = track.querySelector('.bg-alarm')!;
    const warnBar = track.querySelector('.bg-warn')!;

    expect(alarmBar.className).toMatch(/\btop-0\b/);
    expect(alarmBar.className).toMatch(/\bbottom-0\b/);
    // Inset by 3px on both edges rather than full height — the size cue has
    // to read as "lighter" than the alarm bar's, not merely a different hue.
    expect(warnBar.className).toMatch(/top-\[3px\]/);
    expect(warnBar.className).toMatch(/bottom-\[3px\]/);
    expect(warnBar.className).not.toMatch(/\btop-0\b/);
    expect(warnBar.className).not.toMatch(/\bbottom-0\b/);
  });

  it('dwa okna: dwa paski, jeden na okno', () => {
    render(
      <AlertsPanel
        ranges={[
          alertRange({ severity: 'orange', from: '06:00', hours: 2 }),
          alertRange({ severity: 'red', from: '19:00', hours: 2 }),
        ]}
        currentDayOffset={0}
        hasData
      />
    );

    const track = document.querySelector('[data-os-doby]')!;
    expect(track.querySelectorAll('.bg-alarm, .bg-warn')).toHaveLength(2);
  });

  it('reszta panelu (Kompas, zdanie o saldzie) dalej dziala z paskiem nad lista', () => {
    // Regression guard: DayAxis sits right under the header and above the
    // list — it must not disturb the Kompas block or the exchange sentence
    // rendered further down by the branches above.
    render(
      <AlertsPanel
        ranges={[alertRange()]}
        currentDayOffset={0}
        hasData
        exchangeMissing
        compassRanges={[compassRange({ from: '12:00', to: '14:00' })]}
      />
    );

    expect(document.querySelector('[data-os-doby]')).toBeInTheDocument();
    expect(screen.getByText(COMPASS_HEADING)).toBeInTheDocument();
    expect(screen.getByText(EXCHANGE_SENTENCE)).toBeInTheDocument();
  });
});
