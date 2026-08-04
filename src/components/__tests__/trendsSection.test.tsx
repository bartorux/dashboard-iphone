import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendsSection from '../TrendsSection';
import { processData } from '../../utils/dataTransform';
import { makePoint } from '../../test/factories';
import { PSERawItem, PSEDataPoint } from '../../types';

import fixture from '../../utils/__fixtures__/pse-reserve-vs-margin.json';

const RAW = (fixture as { value: PSERawItem[] }).value;

/** A day whose margins are all comfortable, so nothing trips the thresholds. */
const calmDay = (offset: number, margin: number): PSEDataPoint[] =>
  Array.from({ length: 24 }, (_, hour) =>
    makePoint({
      businessDate: `2026-08-0${2 + offset}`,
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      endLabel: `${String((hour + 1) % 24).padStart(2, '0')}:00`,
      timeStr: `2026-08-0${2 + offset} ${String(hour).padStart(2, '0')}:00:00`,
      reserve: 1000 + margin,
      required: 1000,
    })
  );

function renderSection(offset: number, dayData: PSEDataPoint[], allData: PSEDataPoint[]) {
  return render(
    <TrendsSection
      dayData={dayData}
      allData={allData}
      currentDayOffset={offset}
      orangeThreshold={500}
      redThreshold={300}
    />
  );
}

afterEach(() => vi.useRealTimers());

describe('TrendsSection', () => {
  it('reports margins, not raw reserve', () => {
    const day = calmDay(0, 1200);
    renderSection(0, day, day);

    expect(screen.getByText('Średni margines')).toBeInTheDocument();
    expect(screen.getByText('Najniższy margines')).toBeInTheDocument();
    // 2200 MW of reserve against 1000 required is a 1200 MW margin
    expect(screen.getAllByText('+1200 MW').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Średnia rezerwa/)).not.toBeInTheDocument();
  });

  it('hides the comparison on today — a day against itself is always zero', () => {
    const day = calmDay(0, 1200);
    renderSection(0, day, day);

    expect(screen.queryByText('Porównanie z dziś')).not.toBeInTheDocument();
  });

  it('anchors the comparison to today, not to the neighbouring day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12));

    const today = calmDay(0, 1000);
    const tomorrow = calmDay(1, 1400);
    renderSection(1, tomorrow, [...today, ...tomorrow]);

    expect(screen.getByText('Porównanie z dziś')).toBeInTheDocument();
    // The tile and the comparison row must agree — they once showed the same
    // relation with opposite signs
    expect(screen.getAllByText('+400 MW')).toHaveLength(2);
  });

  it('drops the block that presented a forecast count as a prediction', () => {
    const day = calmDay(0, 1200);
    renderSection(0, day, day);

    expect(screen.queryByText(/Predykcja/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MW\/h/)).not.toBeInTheDocument();
  });

  it('scopes risky hours to the selected day', () => {
    const day = calmDay(0, 1200);
    renderSection(0, day, day);

    // Previously fixed at "· 72h", so switching days changed nothing here
    expect(screen.getByText(/· dziś/)).toBeInTheDocument();
    expect(screen.queryByText(/72h/)).not.toBeInTheDocument();
  });

  it('separates "no data" from "nothing near the threshold"', () => {
    renderSection(0, [], []);

    expect(screen.getByText('Brak danych dla tego dnia')).toBeInTheDocument();
  });

  it('gets the direction right on the real day pair that used to read backwards', () => {
    // 2 -> 3 August 2026: reserve rises, margin falls. The old card averaged
    // reserve and showed this as a green improvement.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12));

    const all = processData(RAW);
    const second = all.filter((p) => p.businessDate === '2026-08-03');
    renderSection(1, second, all);

    const comparison = screen.getByText('Porównanie z dziś').parentElement!;
    expect(comparison.textContent).toMatch(/-\d/);
  });
});
