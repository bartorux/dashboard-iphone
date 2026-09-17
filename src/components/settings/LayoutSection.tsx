import React, { useId, useState } from 'react';
import SegmentedControl from '../SegmentedControl';
import Switch from '../Switch';
import { Group, SectionFooter, SectionHeader } from './primitives';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  CARDS,
  CHART_VH,
  CardGroup,
  CardId,
  ChartSize,
  Layout,
  columnsState,
  isCardHidden,
  isDefaultLayout,
} from '../../utils/layout';

const CHART_OPTIONS: { value: ChartSize; label: string }[] = [
  { value: 'compact', label: 'Kompaktowy' },
  { value: 'standard', label: 'Standardowy' },
  { value: 'tall', label: 'Wysoki' },
];

export interface LayoutSectionProps {
  layout: Layout;
  onToggleCard: (id: CardId) => void;
  onChartChange: (chart: ChartSize) => void;
  onReset: () => void;
}

/**
 * A drawing of the grid as the switches leave it.
 *
 * Not decoration: on a 1536px laptop the panel covers the whole right-hand
 * column, and on a 1920px monitor the whole third one — the reader cannot see
 * what a switch just did. This is the only feedback there is, which is also
 * why it draws the columns from --chart-vh rather than from numbers typed in
 * here: a picture that can drift from the page is worse than no picture.
 *
 * Deliberately inert (aria-hidden, no hit targets). A preview you can click is
 * a drag-and-drop editor by the back door, and a half-interactive one is worse
 * than a plainly passive one; what it shows is said in words by the live region
 * in the section below it.
 */
const Preview: React.FC<{ layout: Layout; wide: boolean }> = ({ layout, wide }) => {
  const columns = columnsState(layout);
  const groups: CardGroup[] = wide ? ['answer', 'readings'] : ['answer'];

  /* The chart column is `--chart-vh * 1.6` wide against 28rem (or two of
     24–30rem): the same ratio, in fr, keeps the drawing honest without
     repeating a single pixel value from the grid. */
  const chartFr = (CHART_VH[layout.chart] * 1.6) / 10;
  const sideFr = wide ? 4.8 : 4.48;
  const shown = (group: CardGroup) =>
    CARDS.filter((card) => card.group === group && !isCardHidden(layout, card.id));

  return (
    <div aria-hidden className="mx-4 rounded-xl bg-sheet-cell p-3">
      <div className="mb-2 flex justify-between text-[0.6875rem] text-text-tertiary">
        <span>Podgląd</span>
        <span>{wide ? 'trzy kolumny' : 'dwie kolumny'}</span>
      </div>
      <div className="flex h-24 gap-1">
        <div
          className="flex items-center justify-center rounded bg-accent-soft text-[0.625rem] text-accent-text transition-[flex-grow] duration-200 ease-[cubic-bezier(0.77,0,0.175,1)]"
          style={{ flexGrow: chartFr, flexBasis: 0 }}
        >
          wykres
        </div>
        {groups.map((group) => {
          if (wide && columns !== 'both' && !shown(group).length) return null;
          const cards = wide ? shown(group) : CARDS.filter((card) => !isCardHidden(layout, card.id));
          if (!wide && cards.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-1" style={{ flexGrow: sideFr, flexBasis: 0 }}>
              {cards.map((card) => (
                <span
                  key={card.id}
                  className="truncate rounded-sm bg-text-tertiary/50 px-1 text-[0.5rem] leading-3 text-surface"
                >
                  {card.label}
                </span>
              ))}
              <span className="flex-1 rounded border border-dashed border-separator" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * "Układ (komputer)": how tall the chart is, and which cards are on the page.
 *
 * Desktop only — the whole section is hidden below 80rem, where the phone has
 * one column and nothing to arrange. The day tabs, the chart and the alerts are
 * not on the list at all: the alerts' day axis is aligned to the chart's plot
 * area, so they cannot be parted, and a dashboard with no chart is not this
 * app. Hiding all five cards is a supported state, not an error — what is left
 * is exactly that column.
 */
const LayoutSection: React.FC<LayoutSectionProps> = ({
  layout,
  onToggleCard,
  onChartChange,
  onReset,
}) => {
  const titleId = useId();
  const wide = useMediaQuery('(min-width: 110rem)');
  /*
   * One region, in the tree from the start and empty until there is something
   * to say — the same shape as the threshold error above it, and for the same
   * measured reason: a live region that appears together with its text is not
   * reliably read out.
   */
  const [announcement, setAnnouncement] = useState('');

  const toggleCard = (id: CardId, label: string, hidden: boolean) => {
    onToggleCard(id);
    setAnnouncement(`${label} ${hidden ? 'widoczna' : 'ukryta'}.`);
  };

  const changeChart = (chart: ChartSize) => {
    onChartChange(chart);
    const label = CHART_OPTIONS.find((option) => option.value === chart)?.label.toLowerCase();
    setAnnouncement(`Wykres ${label}.`);
  };

  return (
    <div className="hidden xl:block">
      <SectionHeader id={titleId}>Układ (komputer)</SectionHeader>
      <Preview layout={layout} wide={wide} />
      <div className="mx-4 mt-2">
        <SegmentedControl
          ariaLabel="Wysokość wykresu"
          role="radiogroup"
          value={layout.chart}
          onChange={changeChart}
          segments={CHART_OPTIONS}
        />
      </div>
      <SectionFooter>
        Kolumna z wykresem jest tak szeroka, jak wykres jest wysoki, razy 1,6 — o ile zostaje na to
        miejsce obok pozostałych kolumn.
      </SectionFooter>

      <div className="mt-3">
        <Group labelledBy={titleId}>
          {CARDS.map((card) => (
            <div key={card.id} className="flex min-h-11 items-center gap-3 px-4">
              <span className="flex-1 text-[1.0625rem] text-text">{card.label}</span>
              <Switch
                checked={!isCardHidden(layout, card.id)}
                onChange={() => toggleCard(card.id, card.label, isCardHidden(layout, card.id))}
                label={card.label}
              />
            </div>
          ))}
          {/* Plain text, not a disabled switch: a switch that can never be
              flipped announces itself as one waiting for a condition. */}
          <div className="flex min-h-11 items-center px-4 text-[0.9375rem]">
            <span className="flex-1 text-text-secondary">Dni, wykres i alerty</span>
            <span className="text-[0.8125rem] text-text-tertiary">zawsze widoczne</span>
          </div>
        </Group>
      </div>

      <SectionFooter>Ukrycie karty „Z branży” usuwa też jedyne wejście do panelu wiadomości.</SectionFooter>
      <SectionFooter>
        Układ zapisuje się w tej przeglądarce. Na drugim komputerze, w oknie prywatnym i w innej
        przeglądarce aplikacja zaczyna od układu domyślnego.
      </SectionFooter>

      <div className="mt-3">
        <Group>
          <button
            type="button"
            onClick={onReset}
            disabled={isDefaultLayout(layout)}
            className="flex min-h-11 w-full items-center px-4 text-left text-[1.0625rem] text-accent-text active:bg-surface-3 disabled:text-text-tertiary"
          >
            Przywróć układ
          </button>
        </Group>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};

export default LayoutSection;
