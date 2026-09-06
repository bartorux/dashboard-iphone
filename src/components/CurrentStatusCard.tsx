import React from 'react';
import { PSEDataPoint, SystemStatus } from '../types';
import { STATUS_LABEL, STATUS_SOFT_BG, STATUS_TEXT } from '../utils/status';
import { formatMW } from '../utils/format';
import { marginSeries } from '../utils/dataTransform';
import Skeleton from './Skeleton';
import Sparkline from './Sparkline';
import { CompassIcon } from './icons';
import { COMPASS_WORD, CompassRange } from '../utils/compass';

interface CurrentStatusCardProps {
  point: PSEDataPoint | undefined;
  status: SystemStatus;
  isStale: boolean;
  /**
   * The first fetch of the session, with nothing in state yet — the same flag
   * that puts the header into `connection: 'loading'`. Not "a request is in
   * flight": on a refresh the figures below are still correct and stay put.
   */
  isLoading?: boolean;
  /** Today's 24 blocks, for the trace under the figure. */
  todayData?: PSEDataPoint[];
  /**
   * The Kompas range covering the hour this card is about — and only that one.
   *
   * The card answers "right now", and an operator's request that is running
   * right now is a fact about right now. A flag on some other hour of the day
   * is not: it belongs to the alerts card, which is about the whole day, and
   * repeating it here would turn a card with one job into a second alert list.
   */
  compassNow?: CompassRange | null;
}

/**
 * The headline figure. Previously this lived as one of six equal tiles inside a
 * collapsible section, which buried the single number the app exists to show.
 */
const CurrentStatusCard: React.FC<CurrentStatusCardProps> = ({
  point,
  status,
  isStale,
  isLoading = false,
  todayData = [],
  compassNow = null,
}) => {
  const hasValues =
    point != null && point.reserve !== null && point.required !== null;
  const margin = hasValues ? point!.reserve! - point!.required! : null;

  // Nothing has arrived yet AND nothing was cached: the only state in which a
  // placeholder is honest. Once `point` exists this branch is dead for the rest
  // of the session, which is what keeps a refresh from blanking the figure.
  const firstLoad = isLoading && point == null;

  const series = React.useMemo(() => marginSeries(todayData), [todayData]);
  const currentIndex = React.useMemo(() => {
    if (!point) return null;
    const index = todayData.findIndex((entry) => entry.hourLabel === point.hourLabel);
    return index === -1 ? null : index;
  }, [todayData, point]);

  // The status badge and the margin figure both recolour off the same
  // `status` value that drives Header's own transition-colors duration-500 —
  // one state change, one way of signalling it, so all three land in step
  // instead of the header settling into its new colour while these two lag.
  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.8125rem] text-text-secondary">
            Margines rezerwy
          </div>
          <div className="text-[0.6875rem] text-text-tertiary">
            {point ? `godzina ${point.hourLabel}–${point.endLabel}` : 'teraz'}
          </div>
        </div>
        {/*
          role="status"/aria-live="polite": today a status change on refresh is
          purely visual (the badge recolours), so a screen reader hears nothing
          when "OK" becomes "ALARM". This is the one spot for it — the badge
          changes rarely and in whole words, unlike the margin figure next to
          it, which recomputes every poll and would turn "polite" into a
          running commentary.
        */}
        <span
          role="status"
          aria-live="polite"
          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors duration-500 ${STATUS_SOFT_BG[status]} ${STATUS_TEXT[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/*
        Three states, not two. "Brak odczytu" is an ANSWER — PSE published no
        reserve for this block — and printing it while the first request is
        still in flight told the reader something false about the grid to avoid
        an empty box for two seconds. The skeleton says "not yet"; the tertiary
        sentence keeps saying "not published".
      */}
      {firstLoad ? (
        <>
          <Skeleton className="mt-2 h-12 w-48" />
          <div className="mt-4 flex gap-6 border-t border-separator pt-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24" />
          </div>
        </>
      ) : margin === null ? (
        <div className="mt-3 text-2xl font-semibold text-text-tertiary">
          Brak odczytu
        </div>
      ) : (
        <>
          <div
            className={`tnum mt-2 text-5xl font-semibold leading-none tracking-tight transition-colors duration-500 ${STATUS_TEXT[status]}`}
          >
            {margin > 0 ? '+' : ''}
            {formatMW(margin)}
            <span className="ml-1.5 text-xl font-medium text-text-tertiary">
              MW
            </span>
          </div>

          <dl className="mt-4 flex gap-6 border-t border-separator pt-3 text-[0.8125rem]">
            <div>
              <dt className="text-text-tertiary">Dostępna rezerwa</dt>
              <dd className="tnum font-semibold text-text">
                {formatMW(point!.reserve!)} MW
              </dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Wymagana</dt>
              <dd className="tnum font-semibold text-text">
                {formatMW(point!.required!)} MW
              </dd>
            </div>
          </dl>

          {/*
            Where in the day this hour sits. The figure above is a single
            reading and says nothing about whether the margin is on its way up
            or has just come off a trough — which is the next thing anyone asks,
            and until now meant scrolling to the chart to find out.

            The dot marks the hour the figure belongs to, in the same status
            colour as the figure, so the two are visibly one statement. Every
            value in the trace is available as a number in the hour table under
            the chart.
          */}
          {series.some((value) => value !== null) && (
            <div className="mt-3">
              <Sparkline
                values={series}
                dotIndex={currentIndex}
                toneClassName={STATUS_TEXT[status]}
                className="h-8 xl:h-10"
              />
              <div className="mt-0.5 text-[0.625rem] text-text-tertiary">
                margines w ciągu doby · 00–23
              </div>
            </div>
          )}
        </>
      )}

      {/*
        One line, and only while the request actually covers this hour. Named
        in full and with the operator's own wording, so the reader can match it
        against what PSE publishes — and deliberately NOT coloured like a
        status: this is not "how bad is the margin", it is a different axis of
        meaning that happens to share the clock.
      */}
      {compassNow && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.6875rem] text-compass">
          <CompassIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            Kompas Energetyczny PSE: {COMPASS_WORD[compassNow.level]} do {compassNow.to}
          </span>
        </p>
      )}

      {isStale && (
        <p className="mt-3 text-[0.6875rem] text-text-tertiary">
          Dane z pamięci podręcznej — mogą być nieaktualne.
        </p>
      )}
    </section>
  );
};

export default CurrentStatusCard;
