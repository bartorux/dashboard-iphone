import React, { useState } from 'react';
import { PSEDataPoint } from '../types';
import ReserveChart from './ReserveChart';
import GenerationChart from './GenerationChart';
import HistoryChart from './HistoryChart';
import SegmentedControl from './SegmentedControl';
import { useHistory } from '../hooks/useHistory';
import { useRedispatch } from '../hooks/useRedispatch';
import { CHART_BOX } from './chart/shared';

type ChartView = 'reserve' | 'generation' | 'history';

const HISTORY_DAYS = 30;

const VIEWS: { value: ChartView; label: string; title: string }[] = [
  { value: 'reserve', label: 'Rezerwa', title: 'Rezerwa mocy' },
  { value: 'generation', label: 'Generacja', title: 'Zapotrzebowanie i generacja' },
  { value: 'history', label: 'Na tle 30 dni', title: 'Margines na tle 30 dni' },
];

interface ChartSectionProps {
  dayData: PSEDataPoint[];
  /** Which of the three days is on screen — the views label themselves with it. */
  dayLabel: string;
  orangeThreshold: number;
  redThreshold: number;
  currentHourLabel: string | null;
  isLoading: boolean;
  /**
   * Country-wide demand per hour, keyed by hour start (UTC epoch ms) — the
   * honest denominator behind GenerationChart's "OZE w krajowym miksie"
   * tooltip line. Fetched once in App, not here: RenewableMixCard needs this
   * same map whether or not the generation view is ever opened, so App is now
   * the one place that calls `useKseDemand` — a second call here would fetch
   * pdgobpkd twice for the same business day.
   */
  kseDemand: Map<number, number>;
}

/**
 * One card, one time axis, three readings of it. A switcher rather than three
 * stacked charts: the page is already long, and the views answer different
 * questions rather than needing side-by-side comparison.
 */
const ChartSection: React.FC<ChartSectionProps> = ({
  dayData,
  dayLabel,
  orangeThreshold,
  redThreshold,
  currentHourLabel,
  isLoading,
  kseDemand,
}) => {
  const [view, setView] = useState<ChartView>('reserve');

  // Fetched only once the comparison is actually opened
  const history = useHistory(view === 'history', HISTORY_DAYS);
  // Same idea: only once the generation view is on screen, for the day it shows
  const redispatch = useRedispatch(
    view === 'generation',
    dayData[0]?.businessDate ?? null
  );

  const active = VIEWS.find((entry) => entry.value === view) ?? VIEWS[0];

  /*
   * Which of body()'s four branches is on screen — and NOTHING ELSE.
   *
   * This is the key that drives the crossfade below, so it decides when the
   * chart is remounted. Keyed on `dayData` (or on anything derived from its
   * contents) it would remount on every successful refetch: Recharts would tear
   * down its SVG and replay the 450ms draw over data that had barely moved, at
   * whatever moment the poll happened to land. Branch identity changes only
   * when the reader changes it, which is exactly when a transition is wanted.
   */
  const branch =
    view === 'history'
      ? 'history'
      : isLoading && dayData.length === 0
      ? 'skeleton'
      : dayData.length === 0
      ? 'empty'
      : view;

  const body = () => {
    if (view === 'history') {
      return (
        <HistoryChart
          dayLabel={dayLabel}
          dayData={dayData}
          history={history.points}
          state={history.state}
          days={HISTORY_DAYS}
          onRetry={history.retry}
        />
      );
    }

    if (isLoading && dayData.length === 0) {
      return (
        <div className={CHART_BOX}>
          <div className="h-full animate-pulse rounded-xl bg-surface-2" />
        </div>
      );
    }

    if (dayData.length === 0) {
      return (
        <div
          className={`${CHART_BOX} grid place-items-center text-[0.8125rem] text-text-tertiary`}
        >
          Brak danych do wyświetlenia
        </div>
      );
    }

    if (view === 'generation') {
      return (
        <GenerationChart
          data={dayData}
          currentHourLabel={currentHourLabel}
          redispatch={redispatch.byHour}
          kseDemand={kseDemand}
        />
      );
    }

    return (
      <ReserveChart
        data={dayData}
        orangeThreshold={orangeThreshold}
        redThreshold={redThreshold}
        currentHourLabel={currentHourLabel}
      />
    );
  };

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-3 shadow-sm">
      <h2 className="mb-2 px-1 text-[0.9375rem] font-semibold text-text">
        {active.title} <span className="text-text-tertiary">(MW)</span>
      </h2>

      {/* Same width and same left edge as the day tabs above the card — see the
          note in DayNavigation. Two controls of the same kind, one under the
          other, read as a pair; the same two a dozen pixels apart read as a
          mistake, and at opposite ends of the card as two unrelated things. */}
      <SegmentedControl
        ariaLabel="Widok wykresu"
        value={view}
        onChange={setView}
        segments={VIEWS.map(({ value, label }) => ({ value, label }))}
        className="mb-2 xl:w-[34rem]"
      />

      {/* key={branch}: identity of the branch, never the data — see above. */}
      <div key={branch} className="chart-swap">
        {body()}
      </div>
    </section>
  );
};

export default ChartSection;
