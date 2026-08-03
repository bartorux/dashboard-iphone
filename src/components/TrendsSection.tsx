import React, { useMemo, useState } from 'react';
import { PSEDataPoint } from '../types';
import {
  DAY_NAMES,
  TREND_MAX_REASONABLE,
  TREND_STABLE_THRESHOLD,
} from '../utils/constants';
import {
  getValidReserves,
  safeAvg,
  getDataForDay,
  findAlerts,
  classifyMargin,
} from '../utils/dataTransform';
import { addDays, formatDate, formatHourLabel } from '../utils/dateHelpers';
import { STATUS_TEXT } from '../utils/status';
import { ChevronDownIcon } from './icons';

interface TrendsSectionProps {
  dayData: PSEDataPoint[];
  allData: PSEDataPoint[];
  currentDayOffset: number;
  orangeThreshold: number;
  redThreshold: number;
}

const formatMW = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

const Tile: React.FC<{
  label: string;
  value: string;
  hint: string;
  tone?: string;
}> = ({ label, value, hint, tone = 'text-text' }) => (
  <div className="rounded-xl bg-surface-2 p-3">
    <div className="text-[11px] text-text-secondary">{label}</div>
    <div className={`tnum mt-0.5 text-[19px] font-semibold ${tone}`}>
      {value}
    </div>
    <div className="text-[10px] text-text-tertiary">{hint}</div>
  </div>
);

/** Which of the three shown days a business date belongs to. */
function dayNameFor(businessDate: string): string {
  const today = new Date();
  for (let offset = 0; offset < 3; offset++) {
    if (formatDate(addDays(today, offset)) === businessDate) {
      return DAY_NAMES[offset as 0 | 1 | 2];
    }
  }
  return businessDate;
}

const TrendsSection: React.FC<TrendsSectionProps> = ({
  dayData,
  allData,
  currentDayOffset,
  orangeThreshold,
  redThreshold,
}) => {
  const [expanded, setExpanded] = useState(true);

  const reserves = useMemo(() => getValidReserves(dayData), [dayData]);
  const avgReserve = useMemo(() => safeAvg(reserves), [reserves]);
  const minReserve = useMemo(
    () => (reserves.length > 0 ? Math.min(...reserves) : null),
    [reserves]
  );
  const maxReserve = useMemo(
    () => (reserves.length > 0 ? Math.max(...reserves) : null),
    [reserves]
  );

  /** Selected day compared with the neighbouring day. */
  const comparison = useMemo(() => {
    const currentAvg = safeAvg(reserves);
    const otherOffset = currentDayOffset === 0 ? 1 : currentDayOffset - 1;
    const label = DAY_NAMES[otherOffset as 0 | 1 | 2] ?? `dzień ${otherOffset}`;

    const otherAvg = safeAvg(
      getValidReserves(getDataForDay(allData, otherOffset))
    );
    if (currentAvg === null || otherAvg === null) return null;

    // Measured as "other day relative to the selected one", matching the way
    // the row reads left to right. The opposite sign convention made the
    // comparison and the trend tile contradict each other on screen.
    const diff = otherAvg - currentAvg;
    const pct = currentAvg !== 0 ? (diff / Math.abs(currentAvg)) * 100 : 0;
    return { currentAvg, otherAvg, diff, pct, label };
  }, [allData, currentDayOffset, reserves]);

  const trend = useMemo(() => {
    if (!comparison) {
      return { text: 'brak danych', value: 0, tone: 'text-text-tertiary' };
    }
    const diff = comparison.diff;
    if (Math.abs(diff) > TREND_MAX_REASONABLE) {
      return { text: 'brak danych', value: 0, tone: 'text-text-tertiary' };
    }
    if (Math.abs(diff) < TREND_STABLE_THRESHOLD) {
      return { text: 'stabilny', value: 0, tone: 'text-text-tertiary' };
    }
    return {
      text: diff > 0 ? 'rosnący' : 'spadkowy',
      value: diff,
      tone: diff > 0 ? 'text-ok-text' : 'text-alarm-text',
    };
  }, [comparison]);

  /** Riskiest hours across the whole 72-hour horizon. */
  const critical = useMemo(() => {
    const scored = allData
      .filter(
        (point): point is PSEDataPoint & { reserve: number; required: number } =>
          point.reserve !== null && point.required !== null
      )
      .map((point) => ({
        point,
        difference: point.reserve - point.required,
      }))
      .sort((a, b) => a.difference - b.difference);

    return {
      count: scored.filter((item) => item.difference <= orangeThreshold).length,
      worst: scored.slice(0, 3),
    };
  }, [allData, orangeThreshold]);

  /** No readings at all is a different thing from readings that look fine. */
  const hasHorizonData = useMemo(
    () => allData.some((point) => point.reserve !== null),
    [allData]
  );

  const prediction = useMemo(() => {
    const alerts = findAlerts(allData, orangeThreshold, redThreshold);
    const deltas: number[] = [];
    for (let i = 1; i < dayData.length; i++) {
      const current = dayData[i].reserve;
      const previous = dayData[i - 1].reserve;
      if (current !== null && previous !== null) deltas.push(current - previous);
    }
    const avgTrend = safeAvg(deltas) ?? 0;

    return {
      total: alerts.orange.length + alerts.red.length,
      hasRed: alerts.red.length > 0,
      avgTrend,
    };
  }, [allData, dayData, orangeThreshold, redThreshold]);

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-[15px] font-semibold text-text">Analiza i trendy</h2>
        <ChevronDownIcon
          className={`h-5 w-5 text-text-tertiary transition-transform duration-300 ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      <div className="collapsible" data-collapsed={!expanded}>
        <div>
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Tile
              label="Średnia rezerwa"
              value={avgReserve !== null ? `${formatMW(avgReserve)} MW` : '—'}
              hint="wybrany dzień"
            />
            <Tile
              label="Trend dobowy"
              value={
                trend.value !== 0
                  ? `${trend.value > 0 ? '+' : ''}${formatMW(trend.value)} MW`
                  : trend.text
              }
              hint={comparison ? `vs ${comparison.label.toLowerCase()}` : '—'}
              tone={trend.tone}
            />
            <Tile
              label="Minimum"
              value={minReserve !== null ? `${formatMW(minReserve)} MW` : '—'}
              hint="najniższa wartość"
            />
            <Tile
              label="Maksimum"
              value={maxReserve !== null ? `${formatMW(maxReserve)} MW` : '—'}
              hint="najwyższa wartość"
            />
          </div>

          <div className="mt-4 border-t border-separator pt-3">
            <h3 className="mb-2 text-[13px] font-semibold text-text">
              Porównanie z {comparison ? comparison.label.toLowerCase() : '—'}
            </h3>
            {comparison ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-3">
                <div>
                  <div className="text-[11px] text-text-secondary">
                    Wybrany dzień
                  </div>
                  <div className="tnum text-[15px] font-semibold text-text">
                    {formatMW(comparison.currentAvg)} MW
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className={`tnum text-[17px] font-semibold ${
                      comparison.diff >= 0 ? 'text-ok-text' : 'text-alarm-text'
                    }`}
                  >
                    {comparison.diff >= 0 ? '+' : ''}
                    {formatMW(comparison.diff)} MW
                  </div>
                  <div className="tnum text-[10px] text-text-tertiary">
                    {comparison.pct >= 0 ? '+' : ''}
                    {comparison.pct.toFixed(1)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-text-secondary">
                    {comparison.label}
                  </div>
                  <div className="tnum text-[15px] font-semibold text-text">
                    {formatMW(comparison.otherAvg)} MW
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-text-tertiary">
                Brak danych do porównania
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-separator pt-3">
            <h3 className="mb-2 text-[13px] font-semibold text-text">
              Godziny ryzyka <span className="text-text-tertiary">· 72h</span>
            </h3>
            {!hasHorizonData ? (
              <p className="text-[13px] text-text-tertiary">
                Brak danych z najbliższych 72 godzin
              </p>
            ) : critical.count === 0 ? (
              <p className="text-[13px] text-ok-text">
                Brak godzin ryzyka w najbliższych 72 godzinach
              </p>
            ) : (
              <>
                <p className="text-[13px] text-warn-text">
                  {critical.count} godz. z ryzykiem alertu
                </p>
                <ul className="mt-1.5 space-y-1">
                  {critical.worst.map(({ point, difference }) => (
                    <li
                      key={point.timeStr}
                      className="tnum flex justify-between gap-3 text-[12px] text-text-secondary"
                    >
                      <span>
                        {dayNameFor(point.businessDate)}{' '}
                        {formatHourLabel(point.timeStr)}
                      </span>
                      <span
                        className={`font-semibold ${
                          STATUS_TEXT[
                            classifyMargin(
                              difference,
                              orangeThreshold,
                              redThreshold
                            )
                          ]
                        }`}
                      >
                        {difference > 0 ? '+' : ''}
                        {formatMW(difference)} MW
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="mt-4 border-t border-separator pt-3">
            <h3 className="mb-2 text-[13px] font-semibold text-text">
              Predykcja alertów
            </h3>
            {!hasHorizonData ? (
              <p className="text-[13px] text-text-tertiary">
                Brak podstaw do oceny — nie pobrano danych
              </p>
            ) : (
              <>
                <p
                  className={`text-[13px] ${
                    prediction.total === 0
                      ? 'text-ok-text'
                      : prediction.hasRed
                      ? 'text-alarm-text'
                      : 'text-warn-text'
                  }`}
                >
                  {prediction.total === 0
                    ? 'Niskie prawdopodobieństwo alertów'
                    : prediction.hasRed
                    ? 'Wysokie ryzyko alertów krytycznych'
                    : 'Umiarkowane ryzyko alertów'}
                </p>
                <p className="tnum mt-0.5 text-[11px] text-text-tertiary">
                  Zmiana godzinowa:{' '}
                  {prediction.avgTrend > 10
                    ? 'rosnąca'
                    : prediction.avgTrend < -10
                    ? 'spadkowa'
                    : 'stabilna'}{' '}
                  ({prediction.avgTrend > 0 ? '+' : ''}
                  {prediction.avgTrend.toFixed(0)} MW/h)
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrendsSection;
