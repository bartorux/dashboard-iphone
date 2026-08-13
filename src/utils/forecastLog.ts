import type { PSEDataPoint } from '../types';
import { isEligibleHour } from './callPeriod';
import { DEFAULT_ORANGE_THRESHOLD } from './constants';

/**
 * A record of what the forecast said, so we can later say what changed.
 *
 * The app has always shown a snapshot and described it with confidence. Measured
 * on 11 August: at 11:20 the tightest hour on Wednesday was +139 MW at 20:00; two
 * hours later the same hour read +1331 MW and the day's tightest point had moved
 * to the morning. The card's sentence had become false and nothing in the system
 * could tell, because no previous forecast had ever been kept.
 *
 * Movement is also the thing worth knowing: a call period is declared eight hours
 * ahead, so a forecast sliding the wrong way is the earliest warning there is.
 */

export interface DaySnapshot {
  businessDate: string;
  /** Lowest margin among the day's eligible hours, rounded to whole MW. */
  worstMargin: number | null;
  averageMargin: number | null;
  /** Hour of `worstMargin`, as the UI names it — "20:00". */
  worstHour: string | null;
}

export interface LogEntry {
  /** When the snapshot was taken. */
  at: string;
  days: DaySnapshot[];
}

export interface ForecastLog {
  entries: LogEntry[];
}

/**
 * Three days of hourly runs. Enough to answer "since this morning" and "since
 * yesterday", which are the two spans anyone asks about, and small enough that
 * the file stays a few tens of kilobytes.
 */
export const LOG_LIMIT = 72;

export const EMPTY_LOG: ForecastLog = { entries: [] };

/**
 * Aggregate a day over the hours in which a call period could be declared.
 *
 * The hour set has to be FIXED, and this is the one place the whole feature can
 * quietly lie. Aggregating over "hours still ahead" — which is what the summary
 * facts do, correctly, for their own purpose — would shrink the set every hour
 * on its own. Comparing two such snapshots would then report movement on a day
 * where the forecast had not changed by a single megawatt, and the error would
 * look exactly like real news.
 *
 * Eligible hours (working day, 07:00-22:00) are fixed for the whole life of a
 * business date, and they are also the only hours that carry a decision. A
 * night-time minimum would otherwise drive a "Wednesday is worsening" line about
 * an hour in which nothing can be declared.
 */
export function snapshotDay(
  points: PSEDataPoint[],
  businessDate: string
): DaySnapshot {
  const margins: Array<{ margin: number; hourLabel: string }> = [];

  for (const point of points) {
    if (point.businessDate !== businessDate) continue;
    if (!isEligibleHour(point)) continue;
    if (point.reserve === null || point.required === null) continue;

    const margin = point.reserve - point.required;
    if (!Number.isFinite(margin)) continue;

    margins.push({ margin, hourLabel: point.hourLabel });
  }

  if (margins.length === 0) {
    return {
      businessDate,
      worstMargin: null,
      averageMargin: null,
      worstHour: null,
    };
  }

  const worst = margins.reduce((low, entry) =>
    entry.margin < low.margin ? entry : low
  );
  const total = margins.reduce((sum, entry) => sum + entry.margin, 0);

  return {
    businessDate,
    worstMargin: Math.round(worst.margin),
    averageMargin: Math.round(total / margins.length),
    worstHour: worst.hourLabel,
  };
}

export function snapshotDays(
  points: PSEDataPoint[],
  dates: string[]
): DaySnapshot[] {
  return dates.map((date) => snapshotDay(points, date));
}

/** Whether two snapshots say the same thing, so an unchanged run writes nothing. */
export function sameDays(a: DaySnapshot[], b: DaySnapshot[]): boolean {
  if (a.length !== b.length) return false;

  return a.every((day, index) => {
    const other = b[index];
    return (
      day.businessDate === other.businessDate &&
      day.worstMargin === other.worstMargin &&
      day.averageMargin === other.averageMargin &&
      day.worstHour === other.worstHour
    );
  });
}

/**
 * Add a snapshot, unless it repeats the last one.
 *
 * Without the guard the scheduled job would commit an identical file every hour
 * — 24 commits a day carrying no information, in a repository where a commit is
 * how anything durable is recorded.
 */
export function appendEntry(
  log: ForecastLog,
  entry: LogEntry,
  limit = LOG_LIMIT
): ForecastLog {
  const last = log.entries[log.entries.length - 1];
  if (last && sameDays(last.days, entry.days)) return log;

  const entries = [...log.entries, entry];
  return { entries: entries.slice(Math.max(0, entries.length - limit)) };
}

/**
 * Parse a log read from disk, treating anything unexpected as "no history".
 *
 * A corrupt log must not fail the run: the summary is the product, the log is a
 * convenience, and losing three days of movement history is a smaller harm than
 * a scheduled job that stops producing text.
 */
export function parseLog(raw: unknown): ForecastLog {
  if (typeof raw !== 'object' || raw === null) return EMPTY_LOG;

  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return EMPTY_LOG;

  const clean = entries.filter((entry): entry is LogEntry => {
    if (typeof entry !== 'object' || entry === null) return false;
    const candidate = entry as { at?: unknown; days?: unknown };
    return (
      typeof candidate.at === 'string' &&
      !Number.isNaN(Date.parse(candidate.at)) &&
      Array.isArray(candidate.days)
    );
  });

  return { entries: clean };
}

/**
 * How far a day's forecast has moved, and how much it usually wobbles.
 *
 * The reason the log exists. A call period is declared eight hours ahead, so a
 * forecast sliding the wrong way is the earliest warning there is — earlier than
 * any margin the card can show, because the margin only tells you where the
 * forecast stands, never which way it is going.
 */
export interface Movement {
  /** Signed megawatts. Negative means the day got worse. */
  shift: number;
  /** Typical hour-to-hour step for this day, as its own noise floor. */
  jumpiness: number;
}

/**
 * Below this a shift cannot change how any hour reads.
 *
 * The app's own attention threshold, reused rather than invented: 500 MW is
 * where a margin stops being comfortable in this tool's own settings, so a shift
 * that size is exactly the size that can move a day across it.
 */
export const MOVEMENT_FLOOR_MW = DEFAULT_ORANGE_THRESHOLD;

/**
 * And how far past its own noise a day has to move.
 *
 * Measured across seven business dates: the median hour-to-hour step runs from
 * 1 to 122 MW, so on a settled day even a small drift clears the floor while on
 * a wild one it means nothing. This is the same mistake the cause layer already
 * paid for with a fixed 300 MW threshold — one number cannot serve quantities
 * that vary on different scales.
 */
export const MOVEMENT_NOISE_MULTIPLE = 3;

/** Fewer than this and the windows overlap into meaninglessness. */
export const MOVEMENT_MIN_SNAPSHOTS = 12;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Compares the median of the earliest snapshots with the median of the latest.
 *
 * Medians of windows, never two snapshots. Measured on 12 August: the day moved
 * 1032 MW across 31 hours while a single hour-to-hour step reached 1339 MW — so
 * a difference taken between two readings can be larger than the entire day's
 * drift, and would report movement that reverses an hour later. That is the same
 * failure as text that changes every hour: it stops being read.
 */
export function movementFor(
  log: ForecastLog,
  businessDate: string,
  minSnapshots = MOVEMENT_MIN_SNAPSHOTS
): Movement | null {
  const series = log.entries
    .map((entry) => entry.days.find((day) => day.businessDate === businessDate))
    .filter((day): day is DaySnapshot => day?.worstMargin != null)
    .map((day) => day.worstMargin as number);

  if (series.length < minSnapshots) return null;

  const steps: number[] = [];
  for (let index = 1; index < series.length; index++) {
    steps.push(Math.abs(series[index] - series[index - 1]));
  }

  const window = Math.max(3, Math.floor(series.length / 4));

  return {
    shift: median(series.slice(-window)) - median(series.slice(0, window)),
    // Never zero: a day whose forecast has not moved at all would otherwise make
    // every later comparison divide by nothing.
    jumpiness: Math.max(median(steps), 1),
  };
}

/**
 * The finding in words, or null when the day has not really moved.
 *
 * Deliberately without a figure and without a span. The model may not print
 * digits outside an hour, so a fact carrying "1863 MW" or "przez 30 godzin"
 * would hand it exactly what the validator then refuses — the deadlock this
 * codebase has already hit twice, once over the 1100 MW threshold and once over
 * a date in a day name.
 *
 * No second grade either. "Wyraźnie" was removed from the cause layer for
 * putting a fixed megawatt cut across quantities of different scales, and the
 * same objection applies here.
 */
export function describeMovement(movement: Movement | null): string | null {
  if (!movement) return null;

  const { shift, jumpiness } = movement;
  if (Math.abs(shift) < MOVEMENT_FLOOR_MW) return null;
  if (Math.abs(shift) < MOVEMENT_NOISE_MULTIPLE * jumpiness) return null;

  return shift < 0
    ? 'prognoza tej doby pogarsza się'
    : 'prognoza tej doby poprawia się';
}
