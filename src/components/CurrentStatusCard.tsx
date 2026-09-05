import React from 'react';
import { PSEDataPoint, SystemStatus } from '../types';
import { STATUS_LABEL, STATUS_SOFT_BG, STATUS_TEXT } from '../utils/status';
import { formatMW } from '../utils/format';
import Skeleton from './Skeleton';

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
}) => {
  const hasValues =
    point != null && point.reserve !== null && point.required !== null;
  const margin = hasValues ? point!.reserve! - point!.required! : null;

  // Nothing has arrived yet AND nothing was cached: the only state in which a
  // placeholder is honest. Once `point` exists this branch is dead for the rest
  // of the session, which is what keeps a refresh from blanking the figure.
  const firstLoad = isLoading && point == null;

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
        <span
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
        </>
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
