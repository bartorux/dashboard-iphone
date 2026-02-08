import React, { useState, useMemo } from 'react';
import { PSEDataPoint, AlertSet } from '../types';
import {
  TREND_MAX_REASONABLE,
  TREND_STABLE_THRESHOLD,
  HOURS_PER_DAY,
} from '../utils/constants';
import { getValidReserves, safeAvg, getDataForDay, findAlerts } from '../utils/dataTransform';

interface TrendsSectionProps {
  dayData: PSEDataPoint[];
  allData: PSEDataPoint[];
  currentDayOffset: number;
  orangeThreshold: number;
  redThreshold: number;
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

  // Status based on upcoming hours
  const { status, statusClass } = useMemo(() => {
    const validDayData = dayData.filter(
      (d) => d.reserve !== null && d.required !== null
    );
    if (validDayData.length === 0)
      return { status: '-', statusClass: '' };

    let relevantDifference: number;
    if (currentDayOffset === 0) {
      const currentHour = new Date().getHours();
      const relevantHours = validDayData.slice(
        currentHour,
        currentHour + 3
      );
      if (relevantHours.length > 0) {
        relevantDifference = Math.min(
          ...relevantHours.map((d) => d.reserve! - d.required!)
        );
      } else {
        relevantDifference =
          validDayData[0].reserve! - validDayData[0].required!;
      }
    } else {
      const firstHours = validDayData.slice(0, 3);
      relevantDifference = Math.min(
        ...firstHours.map((d) => d.reserve! - d.required!)
      );
    }

    if (relevantDifference <= redThreshold) {
      return { status: 'ALARM', statusClass: 'text-[#dc3545]' };
    } else if (relevantDifference <= orangeThreshold) {
      return { status: 'UWAGA', statusClass: 'text-[#ffc107]' };
    }
    return { status: 'OK', statusClass: 'text-[#28a745]' };
  }, [dayData, currentDayOffset, orangeThreshold, redThreshold]);

  // 24h trend
  const { trendText, trendValue, trendClass } = useMemo(() => {
    if (currentDayOffset === 0 && allData.length >= 48) {
      const currentHour = new Date().getHours();
      const todaySlice = allData.slice(0, Math.min(currentHour + 1, HOURS_PER_DAY));
      const todayReserves = getValidReserves(todaySlice);
      const todayAvg = safeAvg(todayReserves);

      // "Yesterday" in this context = tomorrow data offset 24-48, but original logic
      // compared to previous day. Since we only have today+2 days ahead, we compare
      // today vs tomorrow for trend.
      const tomorrowSlice = allData.slice(HOURS_PER_DAY, HOURS_PER_DAY + Math.min(currentHour + 1, HOURS_PER_DAY));
      const tomorrowReserves = getValidReserves(tomorrowSlice);
      const tomorrowAvg = safeAvg(tomorrowReserves);

      if (todayAvg !== null && tomorrowAvg !== null) {
        const diff = todayAvg - tomorrowAvg;
        if (Math.abs(diff) > TREND_MAX_REASONABLE) {
          return { trendText: 'brak danych', trendValue: 0, trendClass: 'text-[#6c757d]' };
        }
        if (Math.abs(diff) < TREND_STABLE_THRESHOLD) {
          return { trendText: 'stabilny', trendValue: 0, trendClass: 'text-[#6c757d]' };
        }
        return {
          trendText: diff > 0 ? 'rosnący' : 'spadkowy',
          trendValue: diff,
          trendClass: diff > 0 ? 'text-[#28a745]' : 'text-[#dc3545]',
        };
      }
    } else if (currentDayOffset > 0) {
      const prevDayData = getDataForDay(allData, currentDayOffset - 1);
      const prevReserves = getValidReserves(prevDayData);
      const prevAvg = safeAvg(prevReserves);
      const currentAvg = safeAvg(reserves);

      if (currentAvg !== null && prevAvg !== null) {
        const diff = currentAvg - prevAvg;
        if (Math.abs(diff) > TREND_MAX_REASONABLE) {
          return { trendText: 'brak danych', trendValue: 0, trendClass: 'text-[#6c757d]' };
        }
        if (Math.abs(diff) < TREND_STABLE_THRESHOLD) {
          return { trendText: 'stabilny', trendValue: 0, trendClass: 'text-[#6c757d]' };
        }
        return {
          trendText: diff > 0 ? 'rosnący' : 'spadkowy',
          trendValue: diff,
          trendClass: diff > 0 ? 'text-[#28a745]' : 'text-[#dc3545]',
        };
      }
    }
    return { trendText: 'brak danych', trendValue: 0, trendClass: 'text-[#6c757d]' };
  }, [allData, currentDayOffset, reserves]);

  // Critical hours across all 72h
  const criticalInfo = useMemo(() => {
    const validData = allData.filter(
      (d) => d.reserve !== null && d.required !== null
    );
    const hoursWithReserves = validData
      .map((d, index) => ({
        hour: index,
        difference: d.reserve! - d.required!,
      }))
      .sort((a, b) => a.difference - b.difference);

    const criticalCount = hoursWithReserves.filter(
      (h) => h.difference <= orangeThreshold
    ).length;

    return { criticalCount, worst: hoursWithReserves.slice(0, 3) };
  }, [allData, orangeThreshold]);

  // Alert prediction
  const predictionInfo = useMemo(() => {
    const alerts = findAlerts(allData, orangeThreshold, redThreshold);
    const totalAlerts = alerts.orange.length + alerts.red.length;

    // Hourly trend
    const validData = allData.filter(
      (d, i) =>
        i > 0 &&
        d.reserve !== null &&
        allData[i - 1].reserve !== null &&
        i < HOURS_PER_DAY
    );
    let avgTrend = 0;
    if (allData.length > 1) {
      const trends: number[] = [];
      for (let i = 1; i < Math.min(allData.length, HOURS_PER_DAY); i++) {
        const curr = allData[i].reserve;
        const prev = allData[i - 1].reserve;
        if (curr !== null && prev !== null && !isNaN(curr) && !isNaN(prev)) {
          trends.push(curr - prev);
        }
      }
      avgTrend = trends.length > 0 ? trends.reduce((sum, t) => sum + t, 0) / trends.length : 0;
    }

    return { totalAlerts, hasRedAlerts: alerts.red.length > 0, avgTrend };
  }, [allData, orangeThreshold, redThreshold]);

  // Comparison
  const comparisonAvg = useMemo(() => {
    const todayData = getDataForDay(allData, 0);
    const todayReserves = getValidReserves(todayData);
    return safeAvg(todayReserves);
  }, [allData]);

  return (
    <div className="bg-white border-t border-[#e5e5ea] p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-base font-semibold">Analiza i trendy</h3>
        <button
          onClick={() => setExpanded(!expanded)}
          className="bg-transparent border-none text-sm cursor-pointer px-2 py-1 rounded transition-all text-[#007aff]"
        >
          {expanded ? '\u25BC' : '\u25B2'}
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? 'max-h-[1000px]' : 'max-h-0'
        }`}
      >
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#f8f9fa] p-3 rounded-lg text-center border border-[#e9ecef]">
            <div className="text-xs text-[#6c757d] mb-1">Średnia rezerwa</div>
            <div className="text-lg font-bold text-[#c0392b] mb-0.5">
              {avgReserve !== null ? `${avgReserve.toFixed(0)} MW` : '-'}
            </div>
            <div className="text-[10px] text-[#adb5bd]">
              dla wybranego dnia
            </div>
          </div>

          <div className="bg-[#f8f9fa] p-3 rounded-lg text-center border border-[#e9ecef]">
            <div className="text-xs text-[#6c757d] mb-1">Min. rezerwa</div>
            <div className="text-lg font-bold text-[#c0392b] mb-0.5">
              {minReserve !== null ? `${minReserve.toFixed(0)} MW` : '-'}
            </div>
            <div className="text-[10px] text-[#adb5bd]">
              najniższa wartość
            </div>
          </div>

          <div className="bg-[#f8f9fa] p-3 rounded-lg text-center border border-[#e9ecef]">
            <div className="text-xs text-[#6c757d] mb-1">Trend 24h</div>
            <div className={`text-lg font-bold mb-0.5 ${trendClass}`}>
              {trendValue !== 0 && Math.abs(trendValue) <= TREND_MAX_REASONABLE
                ? `${trendValue > 0 ? '+' : ''}${trendValue.toFixed(0)} MW`
                : trendText}
            </div>
            <div className="text-[10px] text-[#adb5bd]">zmiana vs wczoraj</div>
          </div>

          <div className="bg-[#f8f9fa] p-3 rounded-lg text-center border border-[#e9ecef]">
            <div className="text-xs text-[#6c757d] mb-1">Status</div>
            <div className={`text-lg font-bold mb-0.5 ${statusClass}`}>
              {status}
            </div>
            <div className="text-[10px] text-[#adb5bd]">aktualne godziny</div>
          </div>
        </div>

        {/* Comparison */}
        <div className="mt-4 pt-4 border-t border-[#e9ecef]">
          <h4 className="m-0 mb-2 text-sm font-semibold">
            Porównanie z wczoraj
          </h4>
          <div className="bg-[#f8f9fa] rounded-lg p-3 flex items-center justify-center min-h-[60px]">
            {comparisonAvg !== null ? (
              <div className="text-center">
                <div className="text-sm text-[#6c757d]">Średnia dziś</div>
                <div className="text-base font-semibold text-[#c0392b]">
                  {comparisonAvg.toFixed(0)} MW
                </div>
              </div>
            ) : (
              <div className="text-[#6c757d] text-[13px]">
                Brak danych do porównania
              </div>
            )}
          </div>
        </div>

        {/* Critical hours */}
        <div className="mt-4 pt-4 border-t border-[#e9ecef] text-[13px] leading-relaxed">
          <h4 className="m-0 mb-2 text-sm font-semibold">Godziny ryzyka</h4>
          {criticalInfo.criticalCount === 0 ? (
            <span className="text-[#28a745]">
              Brak godzin ryzyka w najbliższych 72h
            </span>
          ) : (
            <>
              <span className="text-[#ffc107]">
                {criticalInfo.criticalCount} godzin z ryzykiem alertów:
              </span>
              <br />
              {criticalInfo.worst.map((h) => {
                const dayOffset = Math.floor(h.hour / 24);
                const hourInDay = h.hour % 24;
                const dayName =
                  ['dziś', 'jutro', 'pojutrze'][dayOffset] ||
                  `za ${dayOffset} dni`;
                return (
                  <small key={h.hour}>
                    {'• '}
                    {dayName} {hourInDay}:00 - margines{' '}
                    {h.difference.toFixed(0)} MW
                    <br />
                  </small>
                );
              })}
            </>
          )}
        </div>

        {/* Alert prediction */}
        <div className="mt-4 pt-4 border-t border-[#e9ecef]">
          <h4 className="m-0 mb-2 text-sm font-semibold">
            Predykcja alertów
          </h4>
          <div>
            {predictionInfo.totalAlerts === 0 ? (
              <span className="text-[#28a745]">
                Niskie prawdopodobieństwo alertów
              </span>
            ) : predictionInfo.hasRedAlerts ? (
              <span className="text-[#dc3545]">
                Wysokie ryzyko alertów krytycznych
              </span>
            ) : (
              <span className="text-[#ffc107]">
                Umiarkowane ryzyko alertów
              </span>
            )}
            <br />
            <small className="text-[#6c757d]">
              Trend:{' '}
              {predictionInfo.avgTrend > 10
                ? 'rosnący'
                : predictionInfo.avgTrend < -10
                ? 'spadkowy'
                : 'stabilny'}{' '}
              ({predictionInfo.avgTrend.toFixed(1)} MW/h)
            </small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrendsSection;
