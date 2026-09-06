import type { ArchiveRow } from './pk5lArchive';
import type {
  BadanieFile,
  CallEvent,
  CompassVersionRow,
  DayStudy,
  Feature,
  Reading,
} from './badanieTypes';
import { NOTICE_HOURS } from './callPeriod';
import { CALL_PERIOD_EXEMPTION_MW, HOUR_MS } from './constants';

/**
 * Retrospective study: what this tool's own archive said, by the regulatory
 * deadline, about the day a call period (real or test) was actually declared
 * — and the days it was not.
 *
 * Every function here is pure and reads nothing off disk; `scripts/summary.ts`
 * owns loading `data/pk5l-archiwum/*.jsonl`, `data/przywolania.json` and the
 * Kompas version history and passes them in. That split is what makes this
 * testable against a real slice of the archive rather than a mock of one.
 *
 * IMPORTANT: this module runs both in the browser (Europe/Warsaw, always) and
 * in `scripts/summary.ts` under GitHub Actions (`ubuntu-latest`, UTC, no `TZ`
 * pinned). `new Date(y, m, d, h).getHours()`-style "local time" would silently
 * mean UTC there, off by the CET/CEST offset from the real Warsaw deadline —
 * so every wall-clock/instant conversion below goes through `Intl` with an
 * explicit `timeZone`, which reads the ICU database rather than the process
 * clock and is therefore correct regardless of where the process runs.
 */

/** Floor for the dwell count, MW — see `dwellFor`. */
export const DWELL_FLOOR_MW = 1500;

/** Feature count (0-4) from which a day's verdict is called "alarm". */
export const ALARM_FROM = 3;

/** First and last hour a target hour can be auto-selected from, inclusive. */
const AUTO_HOUR_FIRST = 12;
const AUTO_HOUR_LAST = 23;

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * One archived JSONL line per array entry, in `ArchiveRow`'s committed order.
 *
 * Unlike `parseArchiveLines` in pk5lArchive.ts, this keeps every line rather
 * than folding to the last value per (businessDate, hour) key: the whole
 * point of this study is the SEQUENCE of readings for a block, not just where
 * it ended up. A line that fails to parse or does not match the shape is
 * skipped, never thrown — one truncated line from an interrupted write must
 * not cost the whole study.
 */
export function parseArchiveRows(text: string): ArchiveRow[] {
  const rows: ArchiveRow[] = [];
  if (!text) return rows;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!Array.isArray(parsed) || parsed.length !== 6) continue;
    const [businessDate, hour, surplus, required, publicationTsUtc, readAt] = parsed as unknown[];

    if (typeof businessDate !== 'string' || !BUSINESS_DATE.test(businessDate)) continue;
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    if (typeof surplus !== 'number' || !Number.isFinite(surplus)) continue;
    if (typeof required !== 'number' || !Number.isFinite(required)) continue;
    if (typeof publicationTsUtc !== 'string') continue;
    if (typeof readAt !== 'string' || Number.isNaN(Date.parse(readAt))) continue;

    rows.push([businessDate, hour, surplus, required, publicationTsUtc, readAt]);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Timezone-safe wall clock <-> instant conversion (see the module comment)
// ---------------------------------------------------------------------------

const warsawClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const warsawDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" this UTC instant reads as on a Warsaw wall clock. */
function warsawLocalDateOf(instant: Date): string {
  return warsawDate.format(instant);
}

/**
 * The UTC instant at which a Warsaw wall clock reads exactly
 * `businessDate` at `hour`:00:00.
 *
 * Standard two-pass trick: format a first guess (treating the wall time as if
 * it were already UTC) through the real Warsaw calendar to read off that
 * guess's actual offset, then apply the offset once. A day always has a
 * single well-defined offset away from the two-hour DST-transition window
 * itself (never touched by the 07-23 hours this module deals with), so one
 * pass is exact here.
 */
function warsawWallClockToUtc(businessDate: string, hour: number): Date {
  if (!BUSINESS_DATE.test(businessDate)) return new Date(NaN);
  const [year, month, day] = businessDate.split('-').map(Number);

  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const parts = Object.fromEntries(
    warsawClock.formatToParts(guess).map((part) => [part.type, part.value])
  );
  const guessReadAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = guessReadAsUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/** Calendar day before `businessDate`, as "YYYY-MM-DD" (UTC arithmetic, see dateHelpers). */
function dayBefore(businessDate: string): string {
  if (!BUSINESS_DATE.test(businessDate)) return businessDate;
  const [year, month, day] = businessDate.split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day - 1);
  const date = new Date(utcMidnight);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// Reading lookups
// ---------------------------------------------------------------------------

/** One archived reading of a single (businessDate, hour) block, as a value type. */
interface HourReading {
  readAt: string;
  readAtMs: number;
  surplus: number;
  required: number;
}

/**
 * All readings of one (businessDate, hour) block, oldest first.
 *
 * `rows` is assumed already filtered to `readAt <= now` by the caller
 * (`studyDays`) — this function itself does not know `now`, so every reading
 * it is handed is treated as known.
 */
function readingsOf(rows: readonly ArchiveRow[], businessDate: string, hour: number): HourReading[] {
  const readings: HourReading[] = [];
  for (const row of rows) {
    if (row[0] !== businessDate || row[1] !== hour) continue;
    const readAtMs = Date.parse(row[5]);
    if (Number.isNaN(readAtMs)) continue;
    readings.push({ readAt: row[5], readAtMs, surplus: row[2], required: row[3] });
  }
  readings.sort((a, b) => a.readAtMs - b.readAtMs);
  return readings;
}

/** One hour's own decision window — see `computeHourWindow`. */
interface HourWindow {
  deadline: Date;
  open: boolean;
  readingsAsc: HourReading[];
  /** Index into `readingsAsc` of the window reading, or -1 when none qualifies. */
  windowIndex: number;
}

/**
 * One (businessDate, hour) block's own decision window: the last reading AT
 * OR BEFORE its deadline (the hour's Warsaw-local start minus NOTICE_HOURS),
 * inclusive — or, while that deadline has not arrived yet, the latest
 * reading known so far ("open").
 *
 * Shared by `autoTargetHour`, which needs EVERY candidate hour's own window
 * to compare them fairly, and `buildRawDay`, which needs the chosen hour's
 * window to measure it — one rule, computed the same way both times.
 */
function computeHourWindow(
  rows: readonly ArchiveRow[],
  businessDate: string,
  hour: number,
  now: Date
): HourWindow {
  const hourStartUtc = warsawWallClockToUtc(businessDate, hour);
  const deadline = new Date(hourStartUtc.getTime() - NOTICE_HOURS * HOUR_MS);
  const open = now.getTime() < deadline.getTime();
  const readingsAsc = readingsOf(rows, businessDate, hour);

  // Open: the window is simply the latest thing known so far, unbounded by a
  // deadline that has not arrived. Closed: the last reading AT OR BEFORE the
  // deadline — `<=`, so a reading landing exactly on the deadline still
  // counts, matching "at least NOTICE_HOURS ahead" read as an inclusive bound.
  let windowIndex = -1;
  if (open) {
    windowIndex = readingsAsc.length - 1;
  } else {
    for (let index = readingsAsc.length - 1; index >= 0; index--) {
      if (readingsAsc[index].readAtMs <= deadline.getTime()) {
        windowIndex = index;
        break;
      }
    }
  }

  return { deadline, open, readingsAsc, windowIndex };
}

/**
 * Which hour (12-23) counts as "the day's worst" when no `CallEvent` forces
 * one.
 *
 * Ranked by each hour's OWN decision window, never by its latest reading
 * overall. An hour's latest archived reading can land long after THAT HOUR'S
 * OWN deadline — the forecast keeps updating all day — and picking on that
 * basis looks into the future: measured on 2026-09-02, it picked hour 20 off
 * an 857 MW reading taken at 20:05, after the block had already started and
 * the test call period was already running, which is knowledge nobody had
 * by the 12:00 deadline that actually governed the day. Ranking each hour by
 * what its OWN window shows fixes that. An hour with nothing in its window
 * yet (deadline closed with no qualifying reading, or still open with
 * nothing archived at all) is skipped rather than guessed at. Ties go to the
 * earlier hour, which is what the ascending loop with a strict `<` naturally
 * does: the first hour to reach a value only ever loses that spot to
 * something strictly lower.
 */
function autoTargetHour(rows: readonly ArchiveRow[], businessDate: string, now: Date): number | null {
  let best: { hour: number; surplus: number } | null = null;

  for (let hour = AUTO_HOUR_FIRST; hour <= AUTO_HOUR_LAST; hour++) {
    const window = computeHourWindow(rows, businessDate, hour, now);
    if (window.windowIndex === -1) continue;
    const surplus = window.readingsAsc[window.windowIndex].surplus;
    if (best === null || surplus < best.surplus) {
      best = { hour, surplus };
    }
  }

  return best?.hour ?? null;
}

// ---------------------------------------------------------------------------
// Feature construction
// ---------------------------------------------------------------------------

const nullFeature: Feature = { value: null, percentile: null, extreme: false };

/**
 * Consecutive readings, walking BACK from the window reading (inclusive),
 * whose surplus stays below `DWELL_FLOOR_MW`. The first reading at or above
 * the floor — a "breath" the reserve took before slipping again — ends the
 * count, so an old, unrelated dip earlier in the day's history never gets
 * glued onto the current one.
 */
function dwellFor(readingsAsc: HourReading[], windowIndex: number): number {
  let count = 0;
  for (let index = windowIndex; index >= 0; index--) {
    if (readingsAsc[index].surplus >= DWELL_FLOOR_MW) break;
    count++;
  }
  return count;
}

/**
 * Margin of the target hour in the LAST reading (by `readAt`) stamped on the
 * calendar day before D, Warsaw-local. Last, not first: an early D-1 reading
 * can be hours stale by the evening, and the evening figure is the one a
 * person actually saw before going home.
 */
function eveMarginFor(readingsAsc: HourReading[], businessDate: string): number | null {
  const previousDay = dayBefore(businessDate);
  let last: HourReading | null = null;
  for (const reading of readingsAsc) {
    if (warsawLocalDateOf(new Date(reading.readAtMs)) === previousDay) {
      last = reading; // readingsAsc is ascending, so this ends up being the latest match
    }
  }
  return last ? last.surplus - last.required : null;
}

/**
 * The Kompas level active at the window: the published version for (D, hour)
 * with the latest `publishedAt` at or before the window's `readAt`. A version
 * published AFTER the window closed describes knowledge nobody had yet, so it
 * must stay invisible here even though it is sitting in `compass`.
 */
function compassAt(
  compass: readonly CompassVersionRow[],
  businessDate: string,
  hour: number,
  windowReadAtMs: number
): { level: 0 | 1 | 2 | 3 | null; extreme: boolean } {
  let active: CompassVersionRow | null = null;
  for (const version of compass) {
    if (version.businessDate !== businessDate || version.hour !== hour) continue;
    const publishedMs = Date.parse(version.publishedAt);
    if (Number.isNaN(publishedMs) || publishedMs > windowReadAtMs) continue;
    if (!active || publishedMs > Date.parse(active.publishedAt)) active = version;
  }

  if (!active) return { level: null, extreme: false };
  return { level: active.level, extreme: active.level >= 2 };
}

/** Raw (pre-percentile) shape for one day, before the population pass fills in ranks. */
interface RawDay {
  date: string;
  event: CallEvent | null;
  worstHour: number | null;
  window: { readAt: string | null; deadline: string | null; open: boolean };
  surplus: number | null;
  required: number | null;
  margin: number | null;
  headroom: number | null;
  dwell: number | null;
  eveMargin: number | null;
  compass: { level: 0 | 1 | 2 | 3 | null; extreme: boolean };
  readings: Reading[];
}

function buildRawDay(
  rows: readonly ArchiveRow[],
  compass: readonly CompassVersionRow[],
  event: CallEvent | null,
  businessDate: string,
  now: Date
): RawDay {
  const worstHour = event ? event.hour : autoTargetHour(rows, businessDate, now);

  if (worstHour === null) {
    // No CallEvent and not one reading in 12-23 for this day: nothing to
    // measure. Kept as its own day rather than dropped, so the study still
    // accounts for every businessDate in the archive.
    return {
      date: businessDate,
      event,
      worstHour: null,
      window: { readAt: null, deadline: null, open: false },
      surplus: null,
      required: null,
      margin: null,
      headroom: null,
      dwell: null,
      eveMargin: null,
      compass: { level: null, extreme: false },
      readings: [],
    };
  }

  const { deadline, open, readingsAsc, windowIndex } = computeHourWindow(rows, businessDate, worstHour, now);
  const readings: Reading[] = readingsAsc.map((r) => [r.readAt, r.surplus, r.required]);

  if (windowIndex === -1) {
    return {
      date: businessDate,
      event,
      worstHour,
      window: { readAt: null, deadline: deadline.toISOString(), open },
      surplus: null,
      required: null,
      margin: null,
      headroom: null,
      dwell: null,
      eveMargin: null,
      compass: { level: null, extreme: false },
      readings,
    };
  }

  const windowReading = readingsAsc[windowIndex];
  const surplus = windowReading.surplus;
  const required = windowReading.required;

  return {
    date: businessDate,
    event,
    worstHour,
    window: { readAt: windowReading.readAt, deadline: deadline.toISOString(), open },
    surplus,
    required,
    margin: surplus - required,
    headroom: surplus - CALL_PERIOD_EXEMPTION_MW,
    dwell: dwellFor(readingsAsc, windowIndex),
    eveMargin: eveMarginFor(readingsAsc, businessDate),
    compass: compassAt(compass, businessDate, worstHour, windowReading.readAtMs),
    readings,
  };
}

/**
 * Rank one feature across the whole study.
 *
 * The population is every CLOSED day with a non-null value for this feature —
 * open days are compared against it but never join it, so a day still
 * settling cannot inflate or deflate its own rank. `higherIsWorse` picks the
 * direction: `true` for dwell (a longer stretch below the floor is worse),
 * `false` for headroom and eveMargin (a lower figure is worse).
 */
function rankFeature(
  raw: readonly RawDay[],
  value: (day: RawDay) => number | null,
  higherIsWorse: boolean
): Map<string, Feature> {
  const population = raw
    .filter((day) => !day.window.open)
    .map((day) => ({ date: day.date, value: value(day) }))
    .filter((entry): entry is { date: string; value: number } => entry.value !== null);

  const result = new Map<string, Feature>();

  for (const day of raw) {
    const dayValue = value(day);
    if (dayValue === null) {
      result.set(day.date, nullFeature);
      continue;
    }

    const others = population.filter((entry) => entry.date !== day.date);
    if (others.length === 0) {
      result.set(day.date, { value: dayValue, percentile: null, extreme: false });
      continue;
    }

    const lessExtreme = others.filter((entry) =>
      higherIsWorse ? entry.value < dayValue : entry.value > dayValue
    ).length;
    const percentile = lessExtreme / others.length;
    result.set(day.date, { value: dayValue, percentile, extreme: percentile >= 0.9 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function studyDays(
  rows: readonly ArchiveRow[],
  compass: readonly CompassVersionRow[],
  events: readonly CallEvent[],
  now: Date
): DayStudy[] {
  const nowMs = now.getTime();
  // What could actually be known AT `now` — a defensive floor, since real
  // production input never carries a reading from its own future, but a
  // hand-built test fixture could and must not silently see ahead of `now`.
  const knownRows = rows.filter((row) => {
    const readAtMs = Date.parse(row[5]);
    return !Number.isNaN(readAtMs) && readAtMs <= nowMs;
  });

  const businessDates = Array.from(new Set(rows.map((row) => row[0]))).sort();
  const eventByDate = new Map(events.map((event) => [event.date, event]));

  const raw = businessDates.map((date) =>
    buildRawDay(knownRows, compass, eventByDate.get(date) ?? null, date, now)
  );

  const headroom = rankFeature(raw, (day) => day.headroom, false);
  const dwell = rankFeature(raw, (day) => day.dwell, true);
  const eveMargin = rankFeature(raw, (day) => day.eveMargin, false);

  return raw.map((day) => {
    const headroomFeature = headroom.get(day.date) ?? nullFeature;
    const dwellFeature = dwell.get(day.date) ?? nullFeature;
    const eveMarginFeature = eveMargin.get(day.date) ?? nullFeature;

    const extremeCount = [
      headroomFeature.extreme,
      dwellFeature.extreme,
      eveMarginFeature.extreme,
      day.compass.extreme,
    ].filter(Boolean).length;

    const verdict = day.window.open
      ? 'otwarte'
      : day.event && extremeCount >= ALARM_FROM
        ? 'trafienie'
        : !day.event && extremeCount >= ALARM_FROM
          ? 'falszywy-alarm'
          : day.event && extremeCount < ALARM_FROM
            ? 'przeoczenie'
            : 'cisza';

    const study: DayStudy = {
      date: day.date,
      // Filled in by the observations step (obserwacje.ts); the scoring here
      // knows only the register.
      observation: null,
      window: day.window,
      worstHour: day.worstHour,
      surplus: day.surplus,
      required: day.required,
      margin: day.margin,
      headroom: headroomFeature,
      dwell: dwellFeature,
      eveMargin: eveMarginFeature,
      compass: day.compass,
      extremeCount,
      event: day.event,
      verdict,
      readings: day.readings,
    };
    return study;
  });
}

export function buildBadanie(
  rows: readonly ArchiveRow[],
  compass: readonly CompassVersionRow[],
  events: readonly CallEvent[],
  now: Date
): BadanieFile {
  return {
    generatedAt: now.toISOString(),
    noticeHours: NOTICE_HOURS,
    exemptionMw: CALL_PERIOD_EXEMPTION_MW,
    dwellFloorMw: DWELL_FLOOR_MW,
    alarmFrom: ALARM_FROM,
    observations: [],
    days: studyDays(rows, compass, events, now),
    events: [...events],
  };
}
