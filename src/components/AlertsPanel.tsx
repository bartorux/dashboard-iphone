import React from 'react';
import { AlertRange } from '../types';
import { dayLabel } from '../utils/dayWindow';
import { formatMW, signedMW } from '../utils/format';
import { AlertIcon, CheckIcon } from './icons';
import Skeleton from './Skeleton';

interface AlertsPanelProps {
  ranges: AlertRange[];
  currentDayOffset: number;
  /** False when the day has no readings at all — distinct from "no alerts". */
  hasData: boolean;
  /**
   * First fetch of the session — the flag behind the header's 'loading'. Not
   * "a request is in flight": on a refresh the ranges below are still correct.
   */
  isLoading?: boolean;
}

const SEVERITY_STYLE = {
  red: {
    wrapper: 'bg-alarm-soft',
    bar: 'bg-alarm',
    text: 'text-alarm-text',
    label: 'Alarm',
  },
  orange: {
    wrapper: 'bg-warn-soft',
    bar: 'bg-warn',
    text: 'text-warn-text',
    label: 'Uwaga',
  },
} as const;

/**
 * Consecutive alert hours arrive pre-merged into ranges: a four-hour risk window
 * reads as one "17:00-21:00" entry instead of four near-identical rows.
 *
 * Hierarchy: the two numbers a reader decides on — the hour range and the
 * worst margin — sit in one line, one type size, one at the left edge and one
 * at the right, so they line up in columns down the whole list. Everything
 * else (severity label with its icon, the hour of the worst reading, reserve
 * and required) drops to a second, smaller line. "Najniższy margines" does
 * not repeat per row — it is said once, in the caption below the list.
 */
const AlertsPanel: React.FC<AlertsPanelProps> = ({
  ranges,
  currentDayOffset,
  hasData,
  isLoading = false,
}) => {
  const dayName = dayLabel(currentDayOffset);
  const hours = ranges.reduce((sum, range) => sum + range.hours, 0);

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold text-text">
          Alerty <span className="text-text-tertiary">· {dayName}</span>
        </h2>
        {hours > 0 && (
          <span className="tnum rounded-full bg-alarm px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
            {hours} godz.
          </span>
        )}
      </div>

      {/*
        This branch has to come FIRST, before !hasData.

        With nothing fetched yet, hasData is false — and the panel therefore
        announced "Brak danych dla tego dnia" for the whole of the first
        fetch. That is not a slow answer, it is a false one: the day's
        forecast exists, we simply had not asked for it yet, and the reader
        was told PSE had published nothing. Once the request has landed,
        `hasData` regains its real meaning and the sentence below is true
        again.
      */}
      {isLoading && !hasData ? (
        <div className="space-y-1.5">
          <Skeleton className="h-[3.25rem] w-full rounded-xl" />
          <Skeleton className="h-[3.25rem] w-full rounded-xl" />
        </div>
      ) : !hasData ? (
        // Without readings we cannot claim an all-clear — a green "no alerts"
        // here would present missing data as a confirmed safe state.
        <div className="rounded-xl bg-surface-2 px-3 py-3 text-[0.8125rem] text-text-tertiary">
          Brak danych dla tego dnia
        </div>
      ) : ranges.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-3 text-[0.8125rem] text-ok-text">
          <CheckIcon className="h-4 w-4 shrink-0" />
          Brak alertów w tym dniu
        </div>
      ) : (
        <div>
          <ul className="space-y-1.5 xl:grid xl:grid-cols-2 xl:gap-1.5 xl:space-y-0">
            {ranges.map((range) => {
              const style = SEVERITY_STYLE[range.severity];
              return (
                <li
                  key={`${range.severity}-${range.from}`}
                  className={`flex gap-3 overflow-hidden rounded-xl ${style.wrapper}`}
                >
                  <span className={`w-1 shrink-0 ${style.bar}`} aria-hidden />
                  <div className="min-w-0 flex-1 py-2 pr-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="tnum text-[0.9375rem] font-semibold text-text">
                        {range.from}–{range.to}
                      </span>
                      <span
                        className={`tnum text-[0.9375rem] font-semibold ${style.text}`}
                      >
                        {signedMW(range.worstDifference)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3">
                      <span
                        className={`flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold ${style.text}`}
                      >
                        <AlertIcon className="h-3.5 w-3.5" />
                        {style.label}
                      </span>
                      <span className="tnum text-[0.75rem] text-text-secondary">
                        o {range.worstHour} · {formatMW(range.reserve)} /{' '}
                        {formatMW(range.required)} MW
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {/* Raz, zamiast siedmiu razy "Najniższy margines" w kolejnych wierszach. */}
          <p className="mt-2 text-[0.6875rem] text-text-tertiary">
            Po prawej: najniższy margines oraz rezerwa / wymagana moc.
          </p>
        </div>
      )}
    </section>
  );
};

export default AlertsPanel;
