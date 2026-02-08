import React, { useState, useMemo } from 'react';
import { PSEDataPoint } from '../types';
import {
  TREND_MAX_REASONABLE,
  TREND_STABLE_THRESHOLD,
  HOURS_PER_DAY,
} from '../utils/constants';
import { getValidReserves, safeAvg, getDataForDay, findAlerts } from '../utils/dataTransform';
import { formatDateTime, extractHour } from '../utils/dateHelpers';

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

  const maxReserve = useMemo(
    () => (reserves.length > 0 ? Math.max(...reserves) : null),
    [reserves]
  );

  // Find current hour index in dayData by matching timeStr
  const currentIndex = useMemo(() => {
    if (currentDayOffset !== 0) return -1;
    const now = new Date();
    const nowStr = formatDateTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()));
    return dayData.findIndex(d => d.timeStr === nowStr);
  }, [dayData, currentDayOffset]);

  // "Now" card data — only for today
  const nowData = useMemo(() => {
    if (currentIndex < 0) return null;
    const point = dayData[currentIndex];
    if (!point || point.reserve === null || point.required === null) return null;
    const margin = point.reserve - point.required;
    let colorClass: string;
    if (margin <= redThreshold) {
      colorClass = 'text-[#dc3545]';
    } else if (margin <= orangeThreshold) {
      colorClass = 'text-[#ffc107]';
    } else {
      colorClass = 'text-[#28a745]';
    }
    return { reserve: point.reserve, required: point.required, margin, colorClass };
  }, [dayData, currentIndex, orangeThreshold, redThreshold]);

  // Status based on upcoming hours
  const { status, statusClass } = useMemo(() => {
    const validDayData = dayData.filter(
      (d) => d.reserve !== null && d.required !== null
    );
    if (validDayData.length === 0)
      return { status: '-', statusClass: '' };

    let relevantData: PSEDataPoint[];
    if (currentDayOffset === 0 && currentIndex >= 0) {
      // Take up to 3 hours starting from current hour
      relevantData = dayData
        .slice(currentIndex, currentIndex + 3)
        .filter((d) => d.reserve !== null && d.required !== null);
    } else if (currentDayOffset === 0) {
      // Current hour not found in data — use first 3 valid
      relevantData = validDayData.slice(0, 3);
    } else {
      relevantData = validDayData.slice(0, 3);
    }

    if (relevantData.length === 0) {
      relevantData = validDayData.slice(0, 3);
    }

    const relevantDifference = Math.min(
      ...relevantData.map((d) => d.reserve! - d.required!)
    );

    if (relevantDifference <= redThreshold) {
      return { status: 'ALARM', statusClass: 'text-[#dc3545]' };
    } else if (relevantDifference <= orangeThreshold) {
      return { status: 'UWAGA', statusClass: 'text-[#ffc107]' };
    }
    return { status: 'OK', statusClass: 'text-[#28a745]' };
  }, [dayData, currentDayOffset, currentIndex, orangeThreshold, redThreshold]);

  // 24h trend — compare selected day vs previous day (or vs tomorrow for day 0)
  const { trendText, trendValue, trendClass, trendLabel } = useMemo(() => {
    const currentAvg = safeAvg(reserves);

    if (currentDayOffset === 0) {
      // Day 0: compare today vs tomorrow
      const tomorrowData = getDataForDay(allData, 1);
      const tomorrowReserves = getValidReserves(tomorrowData);
      const tomorrowAvg = safeAvg(tomorrowReserves);

      if (currentAvg !== null && tomorrowAvg !== null) {
        const diff = tomorrowAvg - currentAvg;
        if (Math.abs(diff) > TREND_MAX_REASONABLE) {
          return { trendText: 'brak danych', trendValue: 0, trendClass: 'text-[#6c757d]', trendLabel: 'vs jutro' };
        }
        if (Math.abs(diff) < TREND_STABLE_THRESHOLD) {
          return { trendText: 'stabilny', trendValue: 0, trendClass: 'text-[#6c757d]', trendLabel: 'vs jutro' };
        }
        return {
          trendText: diff > 0 ? 'rosnący' : 'spadkowy',
          trendValue: diff,
          trendClass: diff > 0 ? 'text-[#28a745]' : 'text-[#dc3545]',
          trendLabel: 'vs jutro',
        };
      }
    } else {
      // Day 1+: compare selected day vs previous day
      const prevDayData = getDataForDay(allData, currentDayOffset - 1);
      const prevReserves = getValidReserves(prevDayData);
      const prevAvg = safeAvg(prevReserves);

      if (currentAvg !== null && prevAvg !== null) {
        const diff = currentAvg - prevAvg;
        if (Math.abs(diff) > TREND_MAX_REASONABLE) {
          return { trendText: 'brak danych', trendValue: 0, trendClass: 'text-[#6c757d]', trendLabel: 'vs poprzedni dzień' };
        }
        if (Math.abs(diff) < TREND_STABLE_THRESHOLD) {
          return { trendText: 'stabilny', trendValue: 0, trendClass: 'text-[#6c757d]', trendLabel: 'vs poprzedni dzień' };
        }
        return {
          trendText: diff > 0 ? 'rosnący' : 'spadkowy',
          trendValue: diff,
          trendClass: diff > 0 ? 'text-[#28a745]' : 'text-[#dc3545]',
          trendLabel: 'vs poprzedni dzień',
        };
      }
    }
    return { trendText: 'brak danych', trendValue: 0, trendClass: 'text-[#6c757d]', trendLabel: currentDayOffset === 0 ? 'vs jutro' : 'vs poprzedni dzień' };
  }, [allData, currentDayOffset, reserves]);

  // Critical hours across all 72h — use timeStr from data for display
  const criticalInfo = useMemo(() => {
    const hoursWithReserves = allData
      .map((d, index) => ({
        index,
        timeStr: d.timeStr,
        difference: d.reserve !== null && d.required !== null
          ? d.reserve - d.required
          : null,
      }))
      .filter((h): h is { index: number; timeStr: string; difference: number } =>
        h.difference !== null
      )
      .sort((a, b) => a.difference - b.difference);

    const criticalCount = hoursWithReserves.filter(
      (h) => h.difference <= orangeThreshold
    ).length;

    return { criticalCount, worst: hoursWithReserves.slice(0, 3) };
  }, [allData, orangeThreshold]);

  // Alert prediction — use dayData for hourly trend
  const predictionInfo = useMemo(() => {
    const alerts = findAlerts(allData, orangeThreshold, redThreshold);
    const totalAlerts = alerts.orange.length + alerts.red.length;

    // Hourly trend based on selected day
    const trends: number[] = [];
    for (let i = 1; i < dayData.length; i++) {
      const curr = dayData[i].reserve;
      const prev = dayData[i - 1].reserve;
      if (curr !== null && prev !== null && !isNaN(curr) && !isNaN(prev)) {
        trends.push(curr - prev);
      }
    }
    const avgTrend = trends.length > 0 ? trends.reduce((sum, t) => sum + t, 0) / trends.length : 0;

    return { totalAlerts, hasRedAlerts: alerts.red.length > 0, avgTrend };
  }, [allData, dayData, orangeThreshold, redThreshold]);

  // Comparison: selected day vs previous day (or vs tomorrow for day 0)
  const comparison = useMemo(() => {
    const currentAvg = safeAvg(reserves);

    let otherDayOffset: number;
    let label: string;
    if (currentDayOffset === 0) {
      otherDayOffset = 1;
      label = 'jutro';
    } else {
      otherDayOffset = currentDayOffset - 1;
      label = ['dziś', 'jutro', 'pojutrze'][otherDayOffset] || `dzień ${otherDayOffset}`;
    }

    const otherData = getDataForDay(allData, otherDayOffset);
    const otherReserves = getValidReserves(otherData);
    const otherAvg = safeAvg(otherReserves);

    if (currentAvg === null || otherAvg === null) return null;

    const diff = currentAvg - otherAvg;
    const pct = otherAvg !== 0 ? (diff / Math.abs(otherAvg)) * 100 : 0;

    return { currentAvg, otherAvg, diff, pct, label };
  }, [allData, currentDayOffset, reserves]);

  const isToday = currentDayOffset === 0;

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
        <div className={`grid gap-3 mb-4 ${isToday && nowData ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {/* Now card — only for today when data available */}
          {isToday && nowData && (
            <div className="bg-[#f8f9fa] p-3 rounded-lg text-center border border-[#e9ecef]">
              <div className="text-xs text-[#6c757d] mb-1">Teraz</div>
              <div className={`text-lg font-bold mb-0.5 ${nowData.colorClass}`}>
                {nowData.reserve.toFixed(0)} MW
              </div>
              <div className="text-[10px] text-[#adb5bd]">
                wymag. {nowData.required.toFixed(0)} MW
              </div>
            </div>
          )}

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
            <div className="text-xs text-[#6c757d] mb-1">Trend 24h</div>
            <div className={`text-lg font-bold mb-0.5 ${trendClass}`}>
              {trendValue !== 0 && Math.abs(trendValue) <= TREND_MAX_REASONABLE
                ? `${trendValue > 0 ? '+' : ''}${trendValue.toFixed(0)} MW`
                : trendText}
            </div>
            <div className="text-[10px] text-[#adb5bd]">{trendLabel}</div>
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
            <div className="text-xs text-[#6c757d] mb-1">Max. rezerwa</div>
            <div className="text-lg font-bold text-[#c0392b] mb-0.5">
              {maxReserve !== null ? `${maxReserve.toFixed(0)} MW` : '-'}
            </div>
            <div className="text-[10px] text-[#adb5bd]">
              najwyższa wartość
            </div>
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
            Porównanie z {comparison ? comparison.label : (isToday ? 'jutro' : 'poprzednim dniem')}
          </h4>
          <div className="bg-[#f8f9fa] rounded-lg p-3 min-h-[60px]">
            {comparison ? (
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <div className="text-xs text-[#6c757d]">Wybrany dzień</div>
                  <div className="text-base font-semibold text-[#c0392b]">
                    {comparison.currentAvg.toFixed(0)} MW
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-bold ${comparison.diff >= 0 ? 'text-[#28a745]' : 'text-[#dc3545]'}`}>
                    {comparison.diff >= 0 ? '+' : ''}{comparison.diff.toFixed(0)} MW
                  </div>
                  <div className="text-[10px] text-[#adb5bd]">
                    {comparison.pct >= 0 ? '+' : ''}{comparison.pct.toFixed(1)}%
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-[#6c757d]">{comparison.label[0].toUpperCase() + comparison.label.slice(1)}</div>
                  <div className="text-base font-semibold text-[#c0392b]">
                    {comparison.otherAvg.toFixed(0)} MW
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[#6c757d] text-[13px] text-center">
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
                const hour = extractHour(h.timeStr);
                const dayIdx = Math.floor(h.index / HOURS_PER_DAY);
                const dayName =
                  ['dziś', 'jutro', 'pojutrze'][dayIdx] ||
                  `za ${dayIdx} dni`;
                return (
                  <small key={h.index}>
                    {'• '}
                    {dayName} {hour}:00 - margines{' '}
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
