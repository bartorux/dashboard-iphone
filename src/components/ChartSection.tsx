import React, { useState } from 'react';
import { PSEDataPoint } from '../types';
import ReserveChart from './ReserveChart';
import GenerationChart from './GenerationChart';
import HistoryChart from './HistoryChart';
import SegmentedControl from './SegmentedControl';
import { useHistory } from '../hooks/useHistory';
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
}) => {
  const [view, setView] = useState<ChartView>('reserve');

  // Fetched only once the comparison is actually opened
  const history = useHistory(view === 'history', HISTORY_DAYS);

  const active = VIEWS.find((entry) => entry.value === view) ?? VIEWS[0];

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
        <GenerationChart data={dayData} currentHourLabel={currentHourLabel} />
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

      <SegmentedControl
        ariaLabel="Widok wykresu"
        value={view}
        onChange={setView}
        segments={VIEWS.map(({ value, label }) => ({ value, label }))}
        className="mb-2 xl:max-w-[34rem]"
      />

      {body()}
    </section>
  );
};

export default ChartSection;
