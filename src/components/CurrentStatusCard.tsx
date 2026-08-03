import React from 'react';
import { PSEDataPoint, SystemStatus } from '../types';
import { STATUS_LABEL, STATUS_SOFT_BG, STATUS_TEXT } from '../utils/status';
import { formatHourLabel } from '../utils/dateHelpers';

interface CurrentStatusCardProps {
  point: PSEDataPoint | undefined;
  status: SystemStatus;
  isStale: boolean;
}

const formatMW = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

/**
 * The headline figure. Previously this lived as one of six equal tiles inside a
 * collapsible section, which buried the single number the app exists to show.
 */
const CurrentStatusCard: React.FC<CurrentStatusCardProps> = ({
  point,
  status,
  isStale,
}) => {
  const hasValues =
    point != null && point.reserve !== null && point.required !== null;
  const margin = hasValues ? point!.reserve! - point!.required! : null;

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-text-secondary">
            Margines rezerwy
          </div>
          <div className="text-[11px] text-text-tertiary">
            {point ? `godzina ${formatHourLabel(point.timeStr)}` : 'teraz'}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_SOFT_BG[status]} ${STATUS_TEXT[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {margin === null ? (
        <div className="mt-3 text-2xl font-semibold text-text-tertiary">
          Brak danych
        </div>
      ) : (
        <>
          <div
            className={`tnum mt-2 text-5xl font-semibold leading-none tracking-tight ${STATUS_TEXT[status]}`}
          >
            {margin > 0 ? '+' : ''}
            {formatMW(margin)}
            <span className="ml-1.5 text-xl font-medium text-text-tertiary">
              MW
            </span>
          </div>

          <dl className="mt-4 flex gap-6 border-t border-separator pt-3 text-[13px]">
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
        <p className="mt-3 text-[11px] text-text-tertiary">
          Dane z pamięci podręcznej — mogą być nieaktualne.
        </p>
      )}
    </section>
  );
};

export default CurrentStatusCard;
