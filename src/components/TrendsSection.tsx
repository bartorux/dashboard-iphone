import React, { useMemo, useState } from 'react';
import { PSEDataPoint } from '../types';
import {
  DAY_NAMES,
  TREND_MAX_REASONABLE,
  TREND_STABLE_THRESHOLD,
} from '../utils/constants';
import { getValidMargins, safeAvg, classifyMargin } from '../utils/dataTransform';
import { STATUS_TEXT } from '../utils/status';
import { ChevronDownIcon } from './icons';

interface TrendsSectionProps {
  dayData: PSEDataPoint[];
  /** Today's slice, supplied ready-made so this component never reads the clock. */
  todayData: PSEDataPoint[];
  currentDayOffset: number;
  orangeThreshold: number;
  redThreshold: number;
}

const formatMW = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

const signed = (value: number) => `${value > 0 ? '+' : ''}${formatMW(value)} MW`;

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

/**
 * Everything here is expressed as the margin — available reserve minus what is
 * required — because that is what the rest of the app reports and what the
 * alert thresholds act on.
 *
 * Averaging raw reserve, as this section used to, quietly ignores that the
 * required reserve moves as well: across 33 days its hourly value ranged 1033-2016 MW. Two
 * adjacent days compared by reserve reach the opposite conclusion to the same
 * pair compared by margin in roughly one case in eleven.
 */
const TrendsSection: React.FC<TrendsSectionProps> = ({
  dayData,
  todayData,
  currentDayOffset,
  orangeThreshold,
  redThreshold,
}) => {
  const [expanded, setExpanded] = useState(true);

  const margins = useMemo(() => getValidMargins(dayData), [dayData]);
  const avgMargin = useMemo(() => safeAvg(margins), [margins]);
  const minMargin = useMemo(
    () => (margins.length > 0 ? Math.min(...margins) : null),
    [margins]
  );
  const maxMargin = useMemo(
    () => (margins.length > 0 ? Math.max(...margins) : null),
    [margins]
  );

  const toneFor = (value: number | null) =>
    STATUS_TEXT[classifyMargin(value, orangeThreshold, redThreshold)];

  /**
   * Always measured against today. A moving reference — today vs tomorrow,
   * tomorrow vs today, the day after vs tomorrow — meant the anchor changed
   * every time the day was switched.
   */
  const comparison = useMemo(() => {
    if (currentDayOffset === 0) return null;

    const selected = safeAvg(margins);
    const today = safeAvg(getValidMargins(todayData));
    if (selected === null || today === null) return null;

    // Reads left to right: selected day relative to today
    const diff = selected - today;
    const pct = today !== 0 ? (diff / Math.abs(today)) * 100 : 0;
    return { selected, today, diff, pct };
  }, [todayData, currentDayOffset, margins]);

  const trend = useMemo(() => {
    if (!comparison) {
      return { text: '—', value: 0, tone: 'text-text-tertiary' };
    }
    const { diff } = comparison;
    if (Math.abs(diff) > TREND_MAX_REASONABLE) {
      return { text: 'brak danych', value: 0, tone: 'text-text-tertiary' };
    }
    if (Math.abs(diff) < TREND_STABLE_THRESHOLD) {
      return { text: 'jak dziś', value: 0, tone: 'text-text-tertiary' };
    }
    return {
      text: diff > 0 ? 'lepiej' : 'gorzej',
      value: diff,
      tone: diff > 0 ? 'text-ok-text' : 'text-alarm-text',
    };
  }, [comparison]);

  const dayName = DAY_NAMES[currentDayOffset as 0 | 1 | 2] ?? '';

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
          {/* No definition line here: all four tiles carry the word "margines"
              in their own labels, and the card at the top of the screen shows
              the margin sitting above the available and required figures it is
              derived from. */}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Tile
              label="Średni margines"
              value={avgMargin !== null ? signed(avgMargin) : '—'}
              hint={dayName.toLowerCase()}
              tone={toneFor(avgMargin)}
            />
            <Tile
              label="Względem dziś"
              value={trend.value !== 0 ? signed(trend.value) : trend.text}
              hint={currentDayOffset === 0 ? 'wybrany dzień to dziś' : 'różnica średnich'}
              tone={trend.tone}
            />
            <Tile
              label="Najniższy margines"
              value={minMargin !== null ? signed(minMargin) : '—'}
              hint="najtrudniejsza godzina"
              tone={toneFor(minMargin)}
            />
            <Tile
              label="Najwyższy margines"
              value={maxMargin !== null ? signed(maxMargin) : '—'}
              hint="największy zapas"
              tone={toneFor(maxMargin)}
            />
          </div>

          {/* Hidden on today: a day compared with itself is always zero */}
          {currentDayOffset !== 0 && (
            <div className="mt-4 border-t border-separator pt-3">
              <h3 className="mb-2 text-[13px] font-semibold text-text">
                Porównanie z dziś
              </h3>
              {comparison ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-3">
                  <div>
                    <div className="text-[11px] text-text-secondary">Dziś</div>
                    <div className="tnum text-[15px] font-semibold text-text">
                      {signed(comparison.today)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div
                      className={`tnum text-[17px] font-semibold ${
                        comparison.diff >= 0 ? 'text-ok-text' : 'text-alarm-text'
                      }`}
                    >
                      {signed(comparison.diff)}
                    </div>
                    <div className="tnum text-[10px] text-text-tertiary">
                      {comparison.pct >= 0 ? '+' : ''}
                      {comparison.pct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-text-secondary">{dayName}</div>
                    <div className="tnum text-[15px] font-semibold text-text">
                      {signed(comparison.selected)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-text-tertiary">
                  Brak danych do porównania
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </section>
  );
};

export default TrendsSection;
