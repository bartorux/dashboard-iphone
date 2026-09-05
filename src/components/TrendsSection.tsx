import React, { useMemo } from 'react';
import { PSEDataPoint } from '../types';
import { TREND_STABLE_THRESHOLD } from '../utils/constants';
import { dayLabel } from '../utils/dayWindow';
import { getValidMargins, marginSeries, safeAvg, classifyMargin } from '../utils/dataTransform';
import { STATUS_TEXT } from '../utils/status';
import { usePersistentFlag } from '../hooks/usePersistentFlag';
import { signedMW, formatPercent } from '../utils/format';
import { ChevronDownIcon } from './icons';
import Skeleton from './Skeleton';
import Sparkline from './Sparkline';

interface TrendsSectionProps {
  dayData: PSEDataPoint[];
  /** Today's slice, supplied ready-made so this component never reads the clock. */
  todayData: PSEDataPoint[];
  currentDayOffset: number;
  orangeThreshold: number;
  redThreshold: number;
  /** First fetch of the session — the flag behind the header's 'loading'. */
  isLoading?: boolean;
}

const Tile: React.FC<{
  label: string;
  value: string;
  hint: string;
  tone?: string;
  /**
   * Figure not fetched yet. The label and the hint stay: they are ours, they
   * are true before any data arrives, and blanking them would turn a tile that
   * is merely waiting into a tile that has lost its identity.
   */
  loading?: boolean;
  /**
   * The day's 24 hourly margins. All three tiles that carry one show the same
   * trace — it is one day, read three ways — and differ only in where the dot
   * lands.
   */
  series?: (number | null)[];
  /** Index the dot marks, or null for a trace with no dot. */
  dotIndex?: number | null;
  /**
   * True only for the three tiles that ever carry a `series` once loaded —
   * "Względem dziś" never does (see the no-trace comment where it renders).
   * Reserves the sparkline's own height during `loading` so the tile does not
   * grow by ~22px the moment the first response lands: without this, the
   * loading skeleton was one line shorter than the loaded tile ever is, and
   * every tile in the row jumped down together when the sparkline appeared.
   */
  reservesSparkline?: boolean;
}> = ({
  label,
  value,
  hint,
  tone = 'text-text',
  loading,
  series,
  dotIndex = null,
  reservesSparkline,
}) => (
  <div className="rounded-xl bg-surface-2 p-3">
    <div className="text-[0.6875rem] text-text-secondary">{label}</div>
    {loading ? (
      <Skeleton className="mt-0.5 h-6 w-28" />
    ) : (
      <div className={`tnum mt-0.5 text-[1.1875rem] font-semibold ${tone}`}>
        {value}
      </div>
    )}
    <div className="text-[0.625rem] text-text-tertiary">{hint}</div>
    {loading && reservesSparkline && <Skeleton className="mt-1.5 h-4 xl:h-5" />}
    {series && !loading && (
      <Sparkline
        values={series}
        dotIndex={dotIndex}
        toneClassName={tone}
        className="mt-1.5 h-4 xl:h-5"
      />
    )}
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
  isLoading = false,
}) => {
  // Persisted like the analysis card's: two chevrons on one screen behaving
  // differently — one remembering, one not — was an inconsistency of my own making.
  const [expanded, setExpanded] = usePersistentFlag('trends-expanded', true);

  // Nothing fetched yet, and nothing cached. Same rule as the status card:
  // once there is a day in state this is false for the rest of the session, so
  // a refresh never replaces four correct figures with four grey boxes.
  const firstLoad = isLoading && dayData.length === 0;

  const margins = useMemo(() => getValidMargins(dayData), [dayData]);

  /*
   * The shape of the selected day, gaps included — the trace behind three of
   * the four tiles. `getValidMargins` above cannot serve here: it drops missing
   * hours, which is right for the average, the minimum and the maximum and
   * wrong for anything laid out along time (see marginSeries).
   *
   * argmin/argmax are computed on this series rather than taken from the tiles'
   * own min/max, so the dot sits on the hour the figure came from even when the
   * day has gaps in it.
   */
  const series = useMemo(() => marginSeries(dayData), [dayData]);
  const extremes = useMemo(() => {
    let lowest = -1;
    let highest = -1;
    for (let index = 0; index < series.length; index++) {
      const value = series[index];
      if (value === null) continue;
      if (lowest === -1 || value < (series[lowest] as number)) lowest = index;
      if (highest === -1 || value > (series[highest] as number)) highest = index;
    }
    return {
      lowest: lowest === -1 ? null : lowest,
      highest: highest === -1 ? null : highest,
    };
  }, [series]);
  const hasSeries = series.some((value) => value !== null);

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
    /*
     * null, not 0. There is no percentage of nothing, and the guard used to
     * answer the question anyway: a real difference of thousands of megawatts
     * printed as "+0,0%" beside a correct "+3875 MW". Rare — these are averages
     * of floats — but a guard against dividing by zero should fall silent, not
     * produce a confident figure.
     */
    const pct = today !== 0 ? (diff / Math.abs(today)) * 100 : null;
    return { selected, today, diff, pct };
  }, [todayData, currentDayOffset, margins]);

  const trend = useMemo((): { value: number | null; tone: string } => {
    // null, not 0: a difference of zero is a real reading and has to be
    // printable. Conflating the two is how "jak dziś" came to stand in for a
    // figure the card was showing anyway.
    if (!comparison) {
      return { value: null, tone: 'text-text-tertiary' };
    }
    const { diff } = comparison;
    /*
     * There is no ceiling on how large this may be.
     *
     * One used to sit here at 2000 MW, inherited from the pre-React app without
     * a note or a test, and anything above it was reported as "brak danych".
     * Both halves of that were wrong: the figure exists, and the very same card
     * printed it correctly two lines below when expanded. A quiet evening
     * against a windy tomorrow is worth several thousand megawatts and is not an
     * error. Genuinely absent data is caught earlier, where safeAvg returns null
     * and this whole comparison comes back empty.
     */
    /*
     * The tile always carries the figure, even when it rounds to nothing much.
     *
     * A second threshold used to live here, replacing any difference under 10 MW
     * with the words "jak dziś" — while the row four lines below printed the same
     * difference as "+7 MW" and "+0,5%". That is the same card giving two answers
     * about one number, which is exactly what the ceiling above it did until it
     * was removed. A near-zero difference is worth showing as near-zero; the
     * neutral tone already says it is nothing to act on.
     */
    return {
      value: diff,
      tone:
        Math.abs(diff) < TREND_STABLE_THRESHOLD
          ? 'text-text-tertiary'
          : diff > 0
          ? 'text-ok-text'
          : 'text-alarm-text',
    };
  }, [comparison]);

  const dayName = dayLabel(currentDayOffset);

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-[0.9375rem] font-semibold text-text">Analiza i trendy</h2>
        {/* Same curve as .collapsible in App.css, so the chevron and the
            section it points at settle into place together. */}
        <ChevronDownIcon
          className={`h-5 w-5 text-text-tertiary transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
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
            {/* The average has no hour of its own, so it gets the trace and no
                dot: a dot would have to sit somewhere, and every somewhere
                would be a claim the figure does not make. */}
            <Tile
              label="Średni margines"
              value={avgMargin !== null ? signedMW(avgMargin) : '—'}
              hint={dayName.toLowerCase()}
              tone={toneFor(avgMargin)}
              loading={firstLoad}
              series={hasSeries ? series : undefined}
              reservesSparkline
            />
            {/* No trace at all here, deliberately. This tile is the difference
                between two days' averages — a single scalar, not a run of
                hours. Drawing the selected day's shape under it would put a
                24-hour trace beside a figure that is not a 24-hour anything,
                and the eye would read the two as related. */}
            <Tile
              label="Względem dziś"
              value={trend.value !== null ? signedMW(trend.value) : '—'}
              hint={currentDayOffset === 0 ? 'wybrany dzień to dziś' : 'różnica średnich'}
              tone={trend.tone}
              loading={firstLoad}
            />
            {/*
              The window has to be named, because the analysis card above reports
              the same quantity over a different one — it looks only at hours
              still ahead, which is right for a question about being called, and
              these tiles summarise the whole day, which is right for a day.
              Measured on a live evening: this tile read −325 MW at 19:00 while
              the card above said +1535 MW at 22:00. Both true, both labelled
              "the hardest hour", 1860 MW apart, one screen. It happens every day
              once the worst hour has passed.
            */}
            <Tile
              label="Najniższy margines"
              value={minMargin !== null ? signedMW(minMargin) : '—'}
              hint="najtrudniejsza godzina doby"
              tone={toneFor(minMargin)}
              loading={firstLoad}
              series={hasSeries ? series : undefined}
              dotIndex={extremes.lowest}
              reservesSparkline
            />
            <Tile
              label="Najwyższy margines"
              value={maxMargin !== null ? signedMW(maxMargin) : '—'}
              hint="największy zapas doby"
              tone={toneFor(maxMargin)}
              loading={firstLoad}
              series={hasSeries ? series : undefined}
              dotIndex={extremes.highest}
              reservesSparkline
            />
          </div>

          {/* Hidden on today: a day compared with itself is always zero */}
          {currentDayOffset !== 0 && (
            <div className="mt-4 border-t border-separator pt-3">
              <h3 className="mb-2 text-[0.8125rem] font-semibold text-text">
                Porównanie z dziś
              </h3>
              {comparison ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-3">
                  <div>
                    <div className="text-[0.6875rem] text-text-secondary">Dziś</div>
                    <div className="tnum text-[0.9375rem] font-semibold text-text">
                      {signedMW(comparison.today)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div
                      className={`tnum text-[1.0625rem] font-semibold ${
                        comparison.diff >= 0 ? 'text-ok-text' : 'text-alarm-text'
                      }`}
                    >
                      {signedMW(comparison.diff)}
                    </div>
                    {comparison.pct !== null && (
                      <div className="tnum text-[0.625rem] text-text-tertiary">
                        {formatPercent(comparison.pct, 1)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[0.6875rem] text-text-secondary">{dayName}</div>
                    <div className="tnum text-[0.9375rem] font-semibold text-text">
                      {signedMW(comparison.selected)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[0.8125rem] text-text-tertiary">
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
