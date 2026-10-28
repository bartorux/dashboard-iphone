import { warsawWallClockToUtc } from './badanie';
import { NOTICE_HOURS, WINDOW_FIRST_HOUR, WINDOW_LAST_HOUR, isWorkingDay } from './callPeriod';
import { HOUR_MS } from './constants';
import { exchangeArrivedAt, plannedByReading } from './exchangePlan';
import type { ArchiveRow } from './pk5lArchive';
import type { EstimateLogRow, EstimateMethod } from './saldoSzacunek';

/**
 * How the exchange estimate (saldoSzacunek.ts) fares once PSE's plan arrives —
 * the measurement stage 2 exists for. Written by the generator to
 * data/saldo-ocena.json; nothing on screen reads it.
 *
 * Two truths, because the backtest showed they part: the FIRST plan (the
 * reading the plan arrived in) and the plan standing at each hour's notice
 * deadline (its Warsaw start minus NOTICE_HOURS), which is what a call period
 * is decided on. The 13:15 plan alone differs from the deadline state by
 * 0.92 GW on average.
 *
 * The verdicts ask the question that decides stage 3: viewed just before the
 * plan, would the reserve with the estimate folded in (PSE's reserve +
 * k × (estimate − placeholder)) have called the day better than PSE's reserve
 * as it stood? k = 0.9 is the measured reserve/exchange slope, 0.5 the
 * cautious one that added no misses in the backtest.
 */

export type Verdict = 'hit' | 'false-alarm' | 'missed' | 'calm';

export const ESTIMATE_K = { k05: 0.5, k09: 0.9 } as const;

/**
 * A day whose plan was first seen longer than this after the generator's
 * previous reading gets errors but no verdict: "just before the plan" would be
 * hours stale. Measured on the generator's cadence (any business date's
 * reading), not on this date's own rows — the archive keeps a row only when a
 * value changes, and a quiet Sunday leaves a Monday target unchanged for an
 * hour while the heartbeat is fine. The outage of 29.09–14.10 left gaps of 6
 * to 13 hours; a working heartbeat reads every 15 minutes.
 */
export const MAX_ARRIVAL_GAP_MIN = 60;

/** The bar set on 28.10.2026 for showing the estimate on screen. */
export const STAGE3_MIN_WORKING_DAYS = 15;
export const STAGE3_MIN_COVERAGE = 0.75;

export interface ErrorScore {
  /** `placeholder` is what the app has now: PSE's figure before the plan. */
  method: EstimateMethod | 'placeholder';
  /** Days past the last plan the estimate was made from; null for the placeholder. */
  h: number | null;
  hours: number;
  /** Mean |estimate − first plan|, MW. */
  mae: number;
  /** Mean |estimate − plan at the hour's deadline|, MW, over the hours whose deadline has passed. */
  maeAtDeadline: number | null;
  /** Share of hours whose first plan fell inside [p10, p90]; null where there is no band. */
  coverage: number | null;
  /**
   * The sums behind the three figures, so a day carried over from an earlier
   * file still adds up exactly into the totals — rounded means cannot.
   */
  sums: { abs: number; deadlineAbs: number; deadlineHours: number; banded: number; inBand: number };
}

export interface DayScore {
  businessDate: string;
  workingDay: boolean;
  /** The first reading with the plan in. */
  arrivedAt: string;
  /** Minutes from the generator's previous reading to `arrivedAt` — a long one blurs what "just before" was. */
  arrivalGapMin: number | null;
  /** Every hour 7–21 is past its deadline: the score is final and is carried over from then on. */
  closed: boolean;
  errors: ErrorScore[];
  /** Only for a closed working day read on time, with an estimate and readings for every hour 7–21. */
  verdicts: { pse: Verdict; k05: Verdict; k09: Verdict } | null;
}

type Counts = Record<Verdict, number>;

export interface SaldoOcenaFile {
  version: 1;
  days: DayScore[];
  totals: {
    errors: ErrorScore[];
    verdicts: { days: number; pse: Counts; k05: Counts; k09: Counts };
  };
  stage3: {
    workingDays: number;
    workingDaysNeeded: number;
    /** E5 one day past the plan — the estimate that would be on screen for most of a day. */
    coverage: number | null;
    coverageNeeded: number;
    missed: { pse: number; k05: number; k09: number };
  };
}

interface Accumulator {
  method: ErrorScore['method'];
  h: number | null;
  hours: number;
  sums: ErrorScore['sums'];
}

function accumulator(method: ErrorScore['method'], h: number | null): Accumulator {
  return { method, h, hours: 0, sums: { abs: 0, deadlineAbs: 0, deadlineHours: 0, banded: 0, inBand: 0 } };
}

const tenth = (value: number) => Math.round(value * 10) / 10;

function score(acc: Accumulator): ErrorScore {
  const { abs, deadlineAbs, deadlineHours, banded, inBand } = acc.sums;
  return {
    method: acc.method,
    h: acc.h,
    hours: acc.hours,
    mae: Math.round(abs / acc.hours),
    maeAtDeadline: deadlineHours > 0 ? Math.round(deadlineAbs / deadlineHours) : null,
    coverage: banded > 0 ? Math.round((inBand / banded) * 1000) / 1000 : null,
    sums: { abs: tenth(abs), deadlineAbs: tenth(deadlineAbs), deadlineHours, banded, inBand },
  };
}

/**
 * The closed days of an earlier file, kept as they were scored. A closed day
 * is final — its plan has arrived and every deadline has passed — and
 * rescoring it later would only lose it: the generator reads two monthly
 * partitions, so from the 1st of a month the days logged two months back are
 * no longer in what it reads. A file of another version, or a day without
 * sums, is not carried: change the scoring and the version goes up.
 */
function closedDaysOf(previous: unknown): DayScore[] {
  if (!previous || typeof previous !== 'object') return [];
  const file = previous as Partial<SaldoOcenaFile>;
  if (file.version !== 1 || !Array.isArray(file.days)) return [];
  return file.days.filter(
    (day): day is DayScore =>
      !!day &&
      day.closed === true &&
      typeof day.businessDate === 'string' &&
      Array.isArray(day.errors) &&
      day.errors.every((entry) => !!entry && typeof entry.sums === 'object' && entry.sums !== null && typeof entry.hours === 'number')
  );
}

function verdictOf(predicted: boolean, actual: boolean): Verdict {
  if (predicted) return actual ? 'hit' : 'false-alarm';
  return actual ? 'missed' : 'calm';
}

const zeroCounts = (): Counts => ({ hit: 0, 'false-alarm': 0, missed: 0, calm: 0 });

/** The last of `rows` (oldest first) read strictly before / at or before `ms`. */
function lastBefore<T>(rows: readonly T[], readAtMs: (row: T) => number, ms: number, inclusive: boolean): T | undefined {
  let found: T | undefined;
  for (const row of rows) {
    const at = readAtMs(row);
    if (inclusive ? at <= ms : at < ms) found = row;
    else break;
  }
  return found;
}

const orderKey = (method: ErrorScore['method'], h: number | null) => {
  const rank = { placeholder: 0, e5: 1, profile: 2, 'pwm-rdn': 3 }[method];
  return rank * 100 + (h ?? 0);
};

export function evaluateEstimates(
  log: readonly EstimateLogRow[],
  archive: readonly ArchiveRow[],
  now: Date,
  previous: unknown = null
): SaldoOcenaFile {
  const nowMs = now.getTime();
  const carried = closedDaysOf(previous);
  const carriedDates = new Set(carried.map((day) => day.businessDate));
  const dates = [...new Set(log.map((row) => row[0]))].filter((date) => !carriedDates.has(date)).sort();
  const wanted = new Set(dates);

  // Every instant the generator wrote anything, oldest first.
  const readTimes = [...new Set(archive.map((row) => Date.parse(row[5])))]
    .filter((ms) => ms <= nowMs)
    .sort((a, b) => a - b);

  const archiveByDate = new Map<string, ArchiveRow[]>();
  for (const row of archive) {
    if (!wanted.has(row[0]) || Date.parse(row[5]) > nowMs) continue;
    const bucket = archiveByDate.get(row[0]) ?? [];
    bucket.push(row);
    archiveByDate.set(row[0], bucket);
  }
  const logByDate = new Map<string, EstimateLogRow[]>();
  for (const row of log) {
    if (Date.parse(row[7]) > nowMs) continue;
    const bucket = logByDate.get(row[0]) ?? [];
    bucket.push(row);
    logByDate.set(row[0], bucket);
  }

  const days: DayScore[] = [...carried];

  for (const businessDate of dates) {
    const rows = (archiveByDate.get(businessDate) ?? []).sort(
      (a, b) => Date.parse(a[5]) - Date.parse(b[5])
    );
    const planned = plannedByReading(
      rows.map((row) => ({ hour: row[1], readAt: row[5], exchange: row[6] ?? null }))
    );
    const readings = [...planned.keys()]
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .map((readAt) => ({ readAt, planned: planned.get(readAt)! }));
    const arrivedAt = exchangeArrivedAt(readings);
    if (!arrivedAt) continue;
    const arrivalMs = Date.parse(arrivedAt);
    const lastRead = lastBefore(readTimes, (ms) => ms, arrivalMs, false);
    const arrivalGapMin = lastRead !== undefined ? Math.round((arrivalMs - lastRead) / 60_000) : null;

    const archiveByHour = new Map<number, ArchiveRow[]>();
    for (const row of rows) {
      const bucket = archiveByHour.get(row[1]) ?? [];
      bucket.push(row);
      archiveByHour.set(row[1], bucket);
    }
    const logRows = (logByDate.get(businessDate) ?? []).sort(
      (a, b) => Date.parse(a[7]) - Date.parse(b[7])
    );
    const readAtOf = (row: ArchiveRow) => Date.parse(row[5]);
    const logReadAtOf = (row: EstimateLogRow) => Date.parse(row[7]);

    const dayAcc = new Map<string, Accumulator>();
    const add = (method: ErrorScore['method'], h: number | null, value: number, plan: number, deadlinePlan: number | null, band?: readonly [number, number]) => {
      const key = `${method}#${h ?? ''}`;
      const acc = dayAcc.get(key) ?? accumulator(method, h);
      acc.hours += 1;
      acc.sums.abs += Math.abs(value - plan);
      if (deadlinePlan !== null) {
        acc.sums.deadlineHours += 1;
        acc.sums.deadlineAbs += Math.abs(value - deadlinePlan);
      }
      if (band) {
        acc.sums.banded += 1;
        if (plan >= band[0] && plan <= band[1]) acc.sums.inBand += 1;
      }
      dayAcc.set(key, acc);
    };

    let closed = true;
    let verdictable = true;
    const predicted = { pse: false, k05: false, k09: false };
    let actual = false;

    for (let hour = WINDOW_FIRST_HOUR; hour <= WINDOW_LAST_HOUR; hour++) {
      const hourRows = archiveByHour.get(hour) ?? [];
      const before = lastBefore(hourRows, readAtOf, arrivalMs, false);
      const first = lastBefore(hourRows, readAtOf, arrivalMs, true);
      const deadlineMs = warsawWallClockToUtc(businessDate, hour).getTime() - NOTICE_HOURS * HOUR_MS;
      const open = deadlineMs > nowMs;
      if (open) closed = false;
      const atDeadline = open ? undefined : lastBefore(hourRows, readAtOf, deadlineMs, true);

      const plan = first?.[6] ?? null;
      // A deadline that passed before the plan was seen has no plan to score
      // against — only during an outage, when PSE had it and we did not.
      const deadlinePlan = deadlineMs >= arrivalMs ? (atDeadline?.[6] ?? null) : null;
      if (plan === null) {
        verdictable = false;
        continue;
      }

      const placeholder = before?.[6] ?? null;
      if (placeholder !== null) add('placeholder', null, placeholder, plan, deadlinePlan);

      // Per (method, h), the estimate that stood last before the plan: a
      // target is estimated from several horizons as the days go by.
      const stood = new Map<string, EstimateLogRow>();
      let statistical: EstimateLogRow | undefined;
      for (const row of logRows) {
        if (logReadAtOf(row) >= arrivalMs) break;
        if (row[1] !== hour) continue;
        stood.set(`${row[3]}#${row[2]}`, row);
        if (row[3] !== 'pwm-rdn') statistical = row;
      }
      for (const [, , h, method, mw, p10, p90] of stood.values()) {
        add(method, h, mw, plan, deadlinePlan, p10 !== null && p90 !== null ? [p10, p90] : undefined);
      }

      if (!before || !atDeadline || !statistical) {
        verdictable = false;
        continue;
      }
      const [, , surplus, required, , , exchangeBefore] = before;
      const shift = statistical[4] - (exchangeBefore ?? 0);
      if (surplus - required < 0) predicted.pse = true;
      if (surplus + ESTIMATE_K.k05 * shift - required < 0) predicted.k05 = true;
      if (surplus + ESTIMATE_K.k09 * shift - required < 0) predicted.k09 = true;
      if (atDeadline[2] - atDeadline[3] < 0) actual = true;
    }

    const workingDay = isWorkingDay(businessDate);
    const readOnTime = arrivalGapMin !== null && arrivalGapMin <= MAX_ARRIVAL_GAP_MIN;
    const verdicts: DayScore['verdicts'] =
      workingDay && closed && verdictable && readOnTime
        ? {
            pse: verdictOf(predicted.pse, actual),
            k05: verdictOf(predicted.k05, actual),
            k09: verdictOf(predicted.k09, actual),
          }
        : null;

    days.push({
      businessDate,
      workingDay,
      arrivedAt,
      arrivalGapMin,
      closed,
      errors: [...dayAcc.values()]
        .map(score)
        .sort((a, b) => orderKey(a.method, a.h) - orderKey(b.method, b.h)),
      verdicts,
    });
  }
  days.sort((a, b) => a.businessDate.localeCompare(b.businessDate));

  // Totals from the days' own sums, carried days and fresh ones alike.
  const totals = new Map<string, Accumulator>();
  const totalVerdicts = { days: 0, pse: zeroCounts(), k05: zeroCounts(), k09: zeroCounts() };
  for (const day of days) {
    for (const entry of day.errors) {
      const key = `${entry.method}#${entry.h ?? ''}`;
      const acc = totals.get(key) ?? accumulator(entry.method, entry.h);
      acc.hours += entry.hours;
      acc.sums.abs += entry.sums.abs;
      acc.sums.deadlineAbs += entry.sums.deadlineAbs;
      acc.sums.deadlineHours += entry.sums.deadlineHours;
      acc.sums.banded += entry.sums.banded;
      acc.sums.inBand += entry.sums.inBand;
      totals.set(key, acc);
    }
    if (day.verdicts) {
      totalVerdicts.days += 1;
      totalVerdicts.pse[day.verdicts.pse] += 1;
      totalVerdicts.k05[day.verdicts.k05] += 1;
      totalVerdicts.k09[day.verdicts.k09] += 1;
    }
  }
  const totalErrors = [...totals.values()]
    .map(score)
    .sort((a, b) => orderKey(a.method, a.h) - orderKey(b.method, b.h));

  return {
    version: 1,
    days,
    totals: { errors: totalErrors, verdicts: totalVerdicts },
    stage3: {
      workingDays: totalVerdicts.days,
      workingDaysNeeded: STAGE3_MIN_WORKING_DAYS,
      coverage: totalErrors.find((entry) => entry.method === 'e5' && entry.h === 1)?.coverage ?? null,
      coverageNeeded: STAGE3_MIN_COVERAGE,
      missed: {
        pse: totalVerdicts.pse.missed,
        k05: totalVerdicts.k05.missed,
        k09: totalVerdicts.k09.missed,
      },
    },
  };
}
