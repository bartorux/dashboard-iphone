import type { ArchiveRow } from './pk5lArchive';
import type {
  BadanieFile,
  CallEvent,
  CompassVersionRow,
  DayStudy,
  Feature,
  Observation,
  Reading,
} from './badanieTypes';
import { NOTICE_HOURS } from './callPeriod';
import { CALL_PERIOD_EXEMPTION_MW, HOUR_MS } from './constants';
import { exchangeArrivedAt, exchangePlanned, readingHasExchange } from './exchangePlan';

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

/**
 * First and last hour a target hour can be auto-selected from, inclusive.
 *
 * Rozporządzenie w sprawie szczegółowych warunków funkcjonowania systemu
 * elektroenergetycznego, §6: okresy przywołania i testy ogłasza się wyłącznie
 * w blokach mieszczących się w przedziale 7:00-22:00 — a więc godziny
 * STARTOWE mogą być tylko 7-21 (godzina 21 startuje blok 21:00-22:00, ostatni
 * mieszczący się w oknie). Wcześniej ten zakres był zawężony do 12-23, co
 * ucinało blokom porannym prawo do bycia wybranym jako godzina docelowa.
 */
const AUTO_HOUR_FIRST = 7;
const AUTO_HOUR_LAST = 21;

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How far a `businessDate` may sit from `now`, in either direction, before
 * this study refuses to treat it as a real day rather than archive noise.
 *
 * Measured need, not a guess: on 09.09.2026 `data/badanie.json` held 28 days,
 * 9 of them dated in 2031 — PSE published rows carrying that businessDate on
 * 08.09.2026, and the archive wrote them down verbatim, which alone doubled
 * the "Przed nami" table (16 rows shown, 9 of them uninterpretable 2031
 * dates) with nothing a reader could act on. Same two figures the write side
 * uses when it sanity-checks a row before archiving it — enforced again here,
 * independently, so a stray line already sitting in the archive (written
 * before that check existed, or by some other path entirely) still cannot
 * surface on this page. 14 days ahead comfortably covers every open window
 * this study ever produces (`readAt`/deadline never look further out than the
 * day-ahead plan itself); 40 days back is generous enough for a slow-to-close
 * decision window while still rejecting anything that is not, in any
 * plausible sense, "this study's near past or near future".
 */
const STUDY_DAY_MAX_AHEAD_DAYS = 14;
const STUDY_DAY_MAX_BEHIND_DAYS = 40;

const DAY_MS = 24 * HOUR_MS;

/**
 * Whether `businessDate` sits within `STUDY_DAY_MAX_BEHIND_DAYS` /
 * `STUDY_DAY_MAX_AHEAD_DAYS` of `now`, comparing calendar dates in UTC —
 * never Warsaw-local, unlike the wall-clock/instant conversions elsewhere in
 * this module: a business date is a calendar label with no time-of-day
 * attached (see `dayBefore`'s own reasoning), so anchoring the comparison to
 * a timezone would let the boundary shift by an hour for no reason tied to
 * the actual question, which is "how many calendar days apart are these two
 * dates". A malformed `businessDate` is out of window by definition.
 */
function withinStudyWindow(businessDate: string, now: Date): boolean {
  if (!BUSINESS_DATE.test(businessDate)) return false;
  const [year, month, day] = businessDate.split('-').map(Number);
  const businessMs = Date.UTC(year, month - 1, day);
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((businessMs - todayMs) / DAY_MS);
  return diffDays <= STUDY_DAY_MAX_AHEAD_DAYS && diffDays >= -STUDY_DAY_MAX_BEHIND_DAYS;
}

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
 *
 * Accepts both the six-element shape (no `plannedExchange` — every line
 * written before that field existed) and the seven-element shape that added
 * it: the same monthly files feed both this and pk5lArchive.ts's own parser,
 * and a line archived last month must keep reading here exactly as it always
 * has. A missing seventh field reads as `plannedExchange: null`.
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

    if (!Array.isArray(parsed) || (parsed.length !== 6 && parsed.length !== 7)) continue;
    const [businessDate, hour, surplus, required, publicationTsUtc, readAt, exchangeRaw] =
      parsed as unknown[];

    if (typeof businessDate !== 'string' || !BUSINESS_DATE.test(businessDate)) continue;
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    if (typeof surplus !== 'number' || !Number.isFinite(surplus)) continue;
    if (typeof required !== 'number' || !Number.isFinite(required)) continue;
    if (typeof publicationTsUtc !== 'string') continue;
    if (typeof readAt !== 'string' || Number.isNaN(Date.parse(readAt))) continue;

    let plannedExchange: number | null = null;
    if (parsed.length === 7) {
      if (exchangeRaw === null) plannedExchange = null;
      else if (typeof exchangeRaw === 'number' && Number.isFinite(exchangeRaw)) {
        plannedExchange = exchangeRaw;
      } else continue; // seventh field present but malformed: skip, same as any other bad shape
    }

    rows.push([businessDate, hour, surplus, required, publicationTsUtc, readAt, plannedExchange]);
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
  /** Planned exchange, MW, negative = export — null when PSE reported none. */
  exchange: number | null;
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
    readings.push({
      readAt: row[5],
      readAtMs,
      surplus: row[2],
      required: row[3],
      exchange: row[6] ?? null,
    });
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
 * Which hour (7-21) counts as "the day's worst" when no `CallEvent` forces
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

/**
 * Every candidate hour (7-21) other than `excludeHour` whose OWN decision
 * window (same rule `autoTargetHour` ranks by) shows a negative margin — a
 * day can easily have more than one tight hour, and the owner's own reading
 * of the page was that a single target hour hides that. `excludeHour` is
 * normally the day's own target hour, so the list never repeats what the
 * "Godz. docelowa" column already says. An hour with nothing in its window
 * yet is skipped, exactly like `autoTargetHour` skips it. Sorted by surplus
 * ascending — worst first.
 */
function tightHoursFor(
  rows: readonly ArchiveRow[],
  businessDate: string,
  now: Date,
  excludeHour: number | null
): Array<{ hour: number; surplus: number; margin: number }> {
  const tight: Array<{ hour: number; surplus: number; margin: number }> = [];

  for (let hour = AUTO_HOUR_FIRST; hour <= AUTO_HOUR_LAST; hour++) {
    if (hour === excludeHour) continue;
    const window = computeHourWindow(rows, businessDate, hour, now);
    if (window.windowIndex === -1) continue;
    const reading = window.readingsAsc[window.windowIndex];
    const margin = reading.surplus - reading.required;
    if (margin < 0) tight.push({ hour, surplus: reading.surplus, margin });
  }

  tight.sort((a, b) => a.surplus - b.surplus);
  return tight;
}

// ---------------------------------------------------------------------------
// Feature construction
// ---------------------------------------------------------------------------

const nullFeature: Feature = { value: null, percentile: null, extreme: false };

/**
 * Hours the window reading has sat below `DWELL_FLOOR_MW`, measured as the
 * time SPAN from the first reading of the unbroken run to the window reading
 * — not a count of readings.
 *
 * WHY a span and not a count: the generator moved from reading the archive
 * once an hour to once every 15 minutes, so a raw reading count stopped being
 * comparable between a day recorded under the old cadence and one recorded
 * under the new one — the same real dwell time would tally roughly 4x more
 * "readings" after the change for no change in what actually happened.
 * Measuring elapsed wall-clock time instead keeps every day comparable
 * regardless of how densely the archive happened to sample it (verified: the
 * same real span produces the same figure, ±0.1h, whether it is sampled
 * hourly or every 15 minutes).
 *
 * Walking BACK from the window reading (inclusive), the first reading at or
 * above the floor — a "breath" the reserve took before slipping again — ends
 * the run, so an old, unrelated dip earlier in the day's history never gets
 * glued onto the current one; the span is measured from the reading right
 * AFTER that break, not from the break itself.
 *
 * A run of exactly one reading — the window dipped below the floor with the
 * previous reading (if any) at or above it — has nothing to span and reads
 * `0`. That is NOT the same fact as "never dipped below the floor at all" (a
 * quiet day also reads `0` here); the two are told apart by `surplus` /
 * `headroom`, never by this feature alone. Rounded to one decimal place.
 *
 * A reading whose exchange is still the pre-market-clearing placeholder (see
 * `readingHasExchange` in exchangePlan.ts) breaks the run exactly like a
 * reading AT OR ABOVE the floor does, and for the same reason it counts as
 * one when it IS below the floor: a deficit computed without the import that
 * later covers most of an evening gap is an artefact of the forecast not
 * having cleared yet, not a real state of the grid — so it must not glue two
 * genuine below-floor runs together, nor count as a genuine one on its own.
 * This applies to the window reading itself too: a window reading with no
 * real exchange yet reads dwell `0`, the same as one at or above the floor.
 */
function dwellFor(readingsAsc: HourReading[], windowIndex: number): number {
  const windowReading = readingsAsc[windowIndex];
  if (windowReading.surplus >= DWELL_FLOOR_MW || !readingHasExchange(windowReading.exchange)) {
    return 0;
  }

  let runStart = windowIndex;
  for (let index = windowIndex - 1; index >= 0; index--) {
    const reading = readingsAsc[index];
    if (reading.surplus >= DWELL_FLOOR_MW || !readingHasExchange(reading.exchange)) break;
    runStart = index;
  }

  const spanMs = readingsAsc[windowIndex].readAtMs - readingsAsc[runStart].readAtMs;
  return Math.round((spanMs / HOUR_MS) * 10) / 10;
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
 * The Kompas level active at one (businessDate, hour) block's OWN deadline —
 * its Warsaw-local start minus NOTICE_HOURS, exactly the deadline
 * `computeHourWindow` uses for the archive readings, computed directly here
 * rather than reused from it because compass versions have nothing to do
 * with `rows`/`now`: PSE publishes them on its own schedule, every version
 * already happened by the time this module ever sees it. The active version
 * is the one with the latest `publishedAt` at or before that deadline; one
 * published AFTER it describes knowledge nobody had by the deadline, so it
 * must stay invisible here even though it is sitting in `compass`.
 */
function compassForHour(
  compass: readonly CompassVersionRow[],
  businessDate: string,
  hour: number
): 0 | 1 | 2 | 3 | null {
  const deadlineMs = warsawWallClockToUtc(businessDate, hour).getTime() - NOTICE_HOURS * HOUR_MS;

  let active: CompassVersionRow | null = null;
  for (const version of compass) {
    if (version.businessDate !== businessDate || version.hour !== hour) continue;
    const publishedMs = Date.parse(version.publishedAt);
    if (Number.isNaN(publishedMs) || publishedMs > deadlineMs) continue;
    if (!active || publishedMs > Date.parse(active.publishedAt)) active = version;
  }

  return active ? active.level : null;
}

/**
 * `DayStudy.compass` for one business date: the highest Kompas level active,
 * by ITS OWN deadline, across every hour 7-21 — not just the day's target
 * hour.
 *
 * WHY the whole day and not the target hour alone: on 2026-08-04 the version
 * active 8h ahead of 17:00 was L2, but the version active 8h ahead of 18:00
 * (a different hour, a different deadline, very possibly a different
 * version) was only L1 — both hours were part of the SAME real call period.
 * A flag pinned to a single target hour — e.g. the day's worst hour by
 * reserve, which need not be the hour PSE actually called — would have read
 * that day off whichever hour it happened to look at and could easily have
 * landed on the L1 one, losing the event. Scanning every hour 7-21 and
 * taking the maximum means the day reads extreme as soon as ANY hour showed
 * L2+ in its own window, which is what actually caught all three real 2026
 * call periods (30.06, 04.08, 06.08) despite each of them mixing L1 and L2+
 * across their own called hours.
 *
 * An hour with no version published before its own deadline contributes
 * nothing (skipped, not treated as level 0) — `level` is `null` only when
 * NOT ONE hour of the day had anything to show by its deadline.
 */
function compassForDay(
  compass: readonly CompassVersionRow[],
  businessDate: string
): { level: 0 | 1 | 2 | 3 | null; extreme: boolean; hours: number[] } {
  let level: 0 | 1 | 2 | 3 | null = null;
  const hours: number[] = [];

  for (let hour = AUTO_HOUR_FIRST; hour <= AUTO_HOUR_LAST; hour++) {
    const hourLevel = compassForHour(compass, businessDate, hour);
    if (hourLevel === null) continue;
    if (level === null || hourLevel > level) level = hourLevel;
    if (hourLevel >= 2) hours.push(hour); // loop is ascending, so already sorted
  }

  return { level, extreme: level !== null && level >= 2, hours };
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
  compass: { level: 0 | 1 | 2 | 3 | null; extreme: boolean; hours: number[] };
  tightHours: Array<{ hour: number; surplus: number; margin: number }>;
  readings: Reading[];
  exchangeArrivedAt: string | null;
}

function buildRawDay(
  rows: readonly ArchiveRow[],
  compass: readonly CompassVersionRow[],
  event: CallEvent | null,
  businessDate: string,
  now: Date
): RawDay {
  const worstHour = event ? event.hour : autoTargetHour(rows, businessDate, now);
  const tightHours = tightHoursFor(rows, businessDate, now, worstHour);
  // Independent of worstHour/readings entirely — see compassForDay — so it
  // is computed once up front and reused in every return branch below,
  // including the ones with no target hour or no qualifying reading at all.
  const dayCompass = compassForDay(compass, businessDate);

  if (worstHour === null) {
    // No CallEvent and not one reading in 7-21 for this day: nothing to
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
      compass: dayCompass,
      tightHours,
      readings: [],
      exchangeArrivedAt: null,
    };
  }

  const { deadline, open, readingsAsc, windowIndex } = computeHourWindow(rows, businessDate, worstHour, now);
  const readings: Reading[] = readingsAsc.map((r) => [r.readAt, r.surplus, r.required, r.exchange]);
  // Computed from the whole timeline, not just the window reading: the
  // transition from placeholder to real exchange can — and typically does —
  // happen well before the window (the window is the deadline reading, the
  // arrival is whenever it actually happened).
  const arrivedAt = exchangeArrivedAt(readingsAsc);

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
      eveMargin: null,
      dwell: null,
      compass: dayCompass,
      tightHours,
      readings,
      exchangeArrivedAt: arrivedAt,
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
    compass: dayCompass,
    tightHours,
    readings,
    exchangeArrivedAt: arrivedAt,
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
  now: Date,
  /**
   * The CURRENT day-ahead forecast, per business date — used only to decide
   * `DayStudy.exchangePlanned` (see its own doc comment for why). Optional
   * and defaulting to "unknown for every date" so every existing caller
   * (tests included) that has no forecast to hand keeps working unchanged.
   */
  forecastByDate?: ReadonlyMap<string, ReadonlyArray<{ exchange: number | null }>>
): DayStudy[] {
  const nowMs = now.getTime();
  // What could actually be known AT `now` — a defensive floor, since real
  // production input never carries a reading from its own future, but a
  // hand-built test fixture could and must not silently see ahead of `now`.
  const knownRows = rows.filter((row) => {
    const readAtMs = Date.parse(row[5]);
    return !Number.isNaN(readAtMs) && readAtMs <= nowMs;
  });

  const businessDates = Array.from(new Set(rows.map((row) => row[0])))
    .filter((date) => withinStudyWindow(date, now))
    .sort();
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

    // A test call period is picked by the operator regardless of the system
    // state (5/5 tests in 2026 confirm the rule — see badanieTypes.ts's
    // `Verdict.test` comment), so this study — which predicts REAL call
    // periods, not tests — has nothing to claim about the hour on a test day:
    // not a hit, since nothing here forecast the operator's choice, and not a
    // miss either. `'otwarte'` still wins first, ahead of even a test event,
    // because a day whose window has not closed yet has no settled features
    // to score at all. Once closed, a test event wins next, ahead of
    // `extremeCount`: the features and percentiles are still computed
    // normally and the day stays in the ranking population (see
    // `rankFeature`), only the VERDICT is pulled out of the trafienie/
    // falszywy-alarm/przeoczenie/cisza tally.
    const verdict = day.window.open
      ? 'otwarte'
      : day.event?.kind === 'test'
        ? 'test'
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
      tightHours: day.tightHours,
      event: day.event,
      verdict,
      readings: day.readings,
      exchangePlanned: forecastByDate?.has(day.date)
        ? exchangePlanned(forecastByDate.get(day.date)!)
        : null,
      exchangeArrivedAt: day.exchangeArrivedAt,
    };
    return study;
  });
}

export function buildBadanie(
  rows: readonly ArchiveRow[],
  compass: readonly CompassVersionRow[],
  events: readonly CallEvent[],
  now: Date,
  /** Forwarded to `studyDays` — see its own doc comment. */
  forecastByDate?: ReadonlyMap<string, ReadonlyArray<{ exchange: number | null }>>
): BadanieFile {
  return {
    generatedAt: now.toISOString(),
    noticeHours: NOTICE_HOURS,
    exemptionMw: CALL_PERIOD_EXEMPTION_MW,
    dwellFloorMw: DWELL_FLOOR_MW,
    alarmFrom: ALARM_FROM,
    observations: [],
    days: studyDays(rows, compass, events, now, forecastByDate),
    events: [...events],
  };
}

// ---------------------------------------------------------------------------
// Observations: the owner's word on a day, layered on top of the score above.
// ---------------------------------------------------------------------------

/** Newest date first — how `observations` is meant to be read (most recent report up top). */
function byDateDesc(a: Observation, b: Observation): number {
  if (a.date === b.date) return 0;
  return a.date > b.date ? -1 : 1;
}

/**
 * Merges the hand-kept register (`file.events`) with observations reported
 * through Issues, and writes the result onto `day.observation` / the
 * top-level `observations` list.
 *
 * The register always wins a same-date conflict — it is curated by hand,
 * while an Issue is a drive-by report anyone with the link can file. Built
 * by seeding the map with Issues FIRST and letting the register's entries
 * overwrite them second, so "last write wins" naturally becomes "register
 * wins" without a separate conflict check.
 *
 * Deliberately does not touch `verdict`, `worstHour` or any scored field: a
 * day already scored by `studyDays` stays exactly as scored. The one case
 * that needs the day RESCORED — an Issue reporting a test/real call on a day
 * the register knows nothing about — is out of reach for a function that
 * only sees the already-built `file`, which is exactly why
 * `buildBadanieWithObservations` exists below: it rescores first, then calls
 * this.
 */
export function applyObservations(file: BadanieFile, observations: readonly Observation[]): BadanieFile {
  const registerObservations: Observation[] = file.events.map((event) => ({
    date: event.date,
    outcome: event.kind,
    hour: event.hour,
    scope: event.scope,
    note: event.note,
    source: 'register',
  }));

  const byDate = new Map<string, Observation>();
  for (const observation of observations) byDate.set(observation.date, observation);
  for (const observation of registerObservations) byDate.set(observation.date, observation);

  const merged = [...byDate.values()].sort(byDateDesc);

  const days: DayStudy[] = file.days.map((day) => ({
    ...day,
    observation: byDate.get(day.date) ?? null,
  }));

  return { ...file, days, observations: merged };
}

/**
 * `buildBadanie` plus the owner's observations, Issues included.
 *
 * An Issue reporting `test`/`real` for a day with no register event is not
 * just a label: the whole point of recording it is that the day's own
 * numbers get judged against a call period that genuinely happened, so the
 * day must be scored as if that event HAD been typed into the register —
 * target hour taken from the observation, verdict computed with the event in
 * play. `buildBadanie` already takes an `events` list to do exactly that, so
 * the fix is to build a synthetic `CallEvent` for each such Issue and hand
 * the combined list to `buildBadanie` before doing anything else.
 *
 * The register still wins per date: an Issue for a date the register already
 * covers contributes nothing to scoring (its event is dropped here) and
 * nothing to `day.observation` either (`applyObservations` below re-applies
 * the same register-wins rule).
 *
 * `day.observation` / `observations`, however, must still say "issue", not
 * "register", for the days scored off a synthetic event — reporting the
 * source of a same-day guess as the hand-kept register would be a lie about
 * how sure it is. That is why `applyObservations` is called against a copy
 * of the scored file with `events` swapped back to the REAL register: it
 * only ever sees genuine register entries when deciding what counts as
 * `source: 'register'`, while the returned file keeps every event actually
 * used for scoring (register plus the synthetic ones), which is what
 * `day.event` needs to explain its own verdict.
 */
export function buildBadanieWithObservations(
  rows: readonly ArchiveRow[],
  compass: readonly CompassVersionRow[],
  registerEvents: readonly CallEvent[],
  issueObservations: readonly Observation[],
  now: Date,
  /** Forwarded to `buildBadanie` — see its own doc comment. */
  forecastByDate?: ReadonlyMap<string, ReadonlyArray<{ exchange: number | null }>>
): BadanieFile {
  const registerDates = new Set(registerEvents.map((event) => event.date));

  const eventsFromIssues: CallEvent[] = issueObservations
    .filter(
      (observation) =>
        (observation.outcome === 'test' || observation.outcome === 'real') &&
        typeof observation.hour === 'number' &&
        !registerDates.has(observation.date)
    )
    .map((observation) => ({
      date: observation.date,
      hour: observation.hour as number,
      kind: observation.outcome as 'test' | 'real',
      scope: observation.scope ?? 'unit',
      note: observation.note,
    }));

  const scored = buildBadanie(
    rows,
    compass,
    [...registerEvents, ...eventsFromIssues],
    now,
    forecastByDate
  );
  const labeled = applyObservations({ ...scored, events: [...registerEvents] }, issueObservations);
  return { ...labeled, events: scored.events };
}
