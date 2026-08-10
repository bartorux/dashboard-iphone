import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function renderSection(offset: number, dayData: PSEDataPoint[], todayData: PSEDataPoint[]) {
  return render(
    <TrendsSection
      dayData={dayData}
      todayData={todayData}
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
    renderSection(1, tomorrow, today);

    expect(screen.getByText('Porównanie z dziś')).toBeInTheDocument();
    // The tile and the comparison row must agree — they once showed the same
    // relation with opposite signs
    expect(screen.getAllByText('+400 MW')).toHaveLength(2);
  });

  it('reports a large difference instead of calling it missing data', () => {
    // Live case that prompted this: today averaged +1471 MW against tomorrow's
    // +3875 MW. A 2000 MW ceiling turned that into "brak danych" in the tile
    // while the row underneath printed the figure correctly — the card
    // contradicting itself about data it plainly had.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12));

    const today = calmDay(0, 1471);
    const tomorrow = calmDay(1, 3875);
    renderSection(1, tomorrow, today);

    expect(screen.queryByText('brak danych')).not.toBeInTheDocument();
    // Once in the tile, once in the comparison row beneath it.
    expect(screen.getAllByText('+2404 MW')).toHaveLength(2);
  });

  it('prints a near-zero difference instead of the words "jak dziś"', () => {
    // The surviving half of the same if-chain as the removed ceiling: any
    // difference under 10 MW was replaced by words, while the row four lines
    // below printed it as a figure. One card, two answers about one number.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12));

    renderSection(1, calmDay(1, 1478), calmDay(0, 1471));

    expect(screen.queryByText('jak dziś')).not.toBeInTheDocument();
    expect(screen.getAllByText('+7 MW')).toHaveLength(2);
  });

  it('says nothing rather than "+0,0%" when there is nothing to divide by', () => {
    // A day averaging exactly zero used to make the guard answer anyway: a real
    // difference printed beside a confident "+0,0%".
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12));

    renderSection(1, calmDay(1, 2000), calmDay(0, 0));

    // The difference itself is still reported; only the ratio is withheld.
    expect(screen.getAllByText('+2000 MW').length).toBeGreaterThan(0);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('names the window its extremes are taken over', () => {
    // The analysis card reports the same quantity over the hours still ahead.
    // Measured live: this tile read −325 MW at 19:00 while the card above said
    // +1535 MW at 22:00 — both true, 1860 MW apart, one screen.
    renderSection(0, calmDay(0, 1200), calmDay(0, 1200));

    expect(screen.getByText('najtrudniejsza godzina doby')).toBeInTheDocument();
    expect(screen.getByText('największy zapas doby')).toBeInTheDocument();
  });

  it('drops the block that presented a forecast count as a prediction', () => {
    const day = calmDay(0, 1200);
    renderSection(0, day, day);

    expect(screen.queryByText(/Predykcja/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MW\/h/)).not.toBeInTheDocument();
  });

  it('no longer repeats what the alerts panel already says', () => {
    const day = calmDay(0, 1200);
    renderSection(0, day, day);

    // Both blocks reported the same hour count and the same worst margin for
    // the same day; the alerts panel keeps it, with the worst hour folded in.
    expect(screen.queryByText(/Godziny ryzyka/)).not.toBeInTheDocument();
  });

  it('gets the direction right on the real day pair that used to read backwards', () => {
    // 2 -> 3 August 2026: reserve rises, margin falls. The old card averaged
    // reserve and showed this as a green improvement.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12));

    const all = processData(RAW);
    const first = all.filter((p) => p.businessDate === '2026-08-02');
    const second = all.filter((p) => p.businessDate === '2026-08-03');
    renderSection(1, second, first);

    const comparison = screen.getByText('Porównanie z dziś').parentElement!;
    expect(comparison.textContent).toMatch(/-\d/);
  });
});

describe('TrendsSection — zwijanie', () => {
  beforeEach(() => localStorage.clear());

  it('zapamietuje zwiniecie, tak samo jak karta analizy', () => {
    // Two chevrons on one screen behaving differently — one remembering the
    // choice, one springing back open — was an inconsistency of my own making.
    const props = {
      dayData: [] as PSEDataPoint[],
      todayData: [] as PSEDataPoint[],
      currentDayOffset: 0 as const,
      orangeThreshold: 500,
      redThreshold: 300,
    };

    const { unmount } = render(<TrendsSection {...props} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button'));
    unmount();

    render(<TrendsSection {...props} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });
});
