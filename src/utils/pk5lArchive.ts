import type { PSERawItem } from '../types';
import { periodStart, publicationTsToIso } from './dateHelpers';

/**
 * Our own hourly archive of pk5l-wp: what surplus/required reserve the
 * forecast actually stated, kept because pk5l-wp itself does not version.
 *
 * A back-dated check against PSE's history showed the same (business_date,
 * hour) block revised by thousands of megawatts after the fact — one hour's
 * reserve moved from 1192 to 4942 MW between snapshots with no trace of the
 * earlier figure left anywhere PSE publishes. There is therefore no way to
 * later measure this tool's real hit rate or false-alarm rate from PSE's own
 * archive: the only record of what the forecast said AT THE TIME is the one
 * this module writes, run by run.
 *
 * Everything here is a pure function. The file is append-only JSONL, one
 * partition per calendar month, and the actual reading/writing of it lives in
 * scripts/summary.ts (the same split forecastLog.ts uses) — this module only
 * decides WHICH lines a run would add, never touches a filesystem, and is
 * therefore trivial to test against fixed input.
 */

/** [businessDate, hour] combined into the map key `parseArchiveLines` returns. */
type ArchiveKey = string;

/**
 * The three values a line is deduped on: [surplus, required, plannedExchange],
 * all in MW — `plannedExchange` is `null` when PSE published no figure for
 * that row (or when the line predates this field, see `parseArchiveLines`).
 */
type ArchivedValue = readonly [surplus: number, required: number, plannedExchange: number | null];

/**
 * One archived line, in the exact order the format commits to:
 * [businessDate, hour of the block's START (0-23), surplus, required,
 * PSE's own publication_ts_utc for the row (or '' when PSE did not send
 * one), the ISO instant this job read it, and planned exchange (MW,
 * negative = export, or null when PSE did not report one)].
 *
 * The seventh field is OPTIONAL in the type, not because a newly written line
 * ever omits it (every line this module writes from now on carries seven
 * elements, `null` included), but so that every six-element line already on
 * disk — written before this field existed — still satisfies the type
 * unchanged, and so existing call sites that build a row by hand keep typing.
 */
export type ArchiveRow = readonly [
  businessDate: string,
  hour: number,
  surplus: number,
  required: number,
  publicationTsUtc: string,
  readAt: string,
  plannedExchange?: number | null,
];

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How far a row's business_date may sit from this run's own calendar date
 * before it is treated as garbage rather than a legitimate forecast row.
 *
 * On 2026-09-08 at 14:31 PSE served — with no error, no flag, nothing to
 * distinguish it from a normal row — 200 rows for business dates
 * 2031-08-24 through 2031-09-01 (PSE's own publication_ts_utc on those rows:
 * 2026-09-02T20:11), and this archive wrote every one of them verbatim. A
 * live re-check the same day found PSE still serving equally implausible
 * rows dated in 2027, so this is not a one-off glitch to special-case away
 * but a standing property of the source every run has to guard against.
 *
 * 14 days ahead is a wide margin over PSE's own publication horizon for
 * pk5l-wp, which in practice is about 5 business days out. 40 days back
 * covers the one case a genuinely wide backward window exists for:
 * backfilling history around a calendar month boundary.
 */
const MAX_BUSINESS_DATE_DAYS_AHEAD = 14;
const MAX_BUSINESS_DATE_DAYS_BEHIND = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function archiveKey(businessDate: string, hour: number): ArchiveKey {
  return `${businessDate}#${hour}`;
}

/**
 * Parses a strict "YYYY-MM-DD" into a UTC calendar-day timestamp (midnight
 * UTC that day), or null if the string is not that shape or not a real
 * calendar date (month 13, day 31 of a 30-day month, ...). `Date.UTC` alone
 * would silently roll such input over into the following month rather than
 * reject it, so the constructed date is read back and compared field by
 * field before it is trusted.
 */
function parseUtcCalendarDate(dateStr: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(ms);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/**
 * Whether `businessDate` falls within [-40, +14] CALENDAR days of `nowIso`'s
 * own UTC calendar date. Deliberately compares dates, not instants:
 * business_date is a bare "YYYY-MM-DD" with no time of day, so comparing it
 * to a millisecond timestamp would make the boundary flicker with the time
 * of day a run happens to execute at — a row for "tomorrow" filed at 23:59
 * UTC must not read any differently than the same row filed at 00:01 UTC.
 */
function isPlausibleBusinessDate(businessDate: string, nowIso: string): boolean {
  const businessMs = parseUtcCalendarDate(businessDate);
  if (businessMs === null) return false;

  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return false;
  const nowCalendarMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const diffDays = Math.round((businessMs - nowCalendarMs) / MS_PER_DAY);
  return diffDays <= MAX_BUSINESS_DATE_DAYS_AHEAD && diffDays >= -MAX_BUSINESS_DATE_DAYS_BEHIND;
}

/**
 * How many of this run's raw rows `newArchiveLines` would drop purely for
 * failing the business_date sanity window above — counted independently of
 * whether a row would also be dropped for some other reason (bad period,
 * missing surplus, ...). `newArchiveLines` keeps its existing signature (no
 * `{ lines, skipped }` return) so this stays a second, opt-in call; the
 * caller in scripts/summary.ts is expected to call this alongside
 * `newArchiveLines` and log the count, since staying silent about it is
 * exactly the failure mode that let 200 rows dated 2031 into the archive
 * unnoticed on 2026-09-08.
 */
export function countImplausibleBusinessDates(
  rows: readonly PSERawItem[],
  nowIso: string
): number {
  let count = 0;
  for (const row of rows) {
    const businessDate = row.business_date;
    if (typeof businessDate !== 'string' || !isPlausibleBusinessDate(businessDate, nowIso)) {
      count++;
    }
  }
  return count;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Hour the block STARTS, as 0-23 — read from `period` ("17 - 18" -> 17),
 * exactly as dataTransform's hourLabels does for the chart.
 *
 * Deliberately never `new Date(item.plan_dtime).getHours()`: `plan_dtime`
 * carries the block's END in LOCAL wall-clock time, so that reading is both
 * the wrong edge of the block and, on any process not pinned to Europe/Warsaw,
 * the wrong hour entirely.
 */
function blockStartHour(period: string | undefined): number | null {
  const start = periodStart(period ?? '');
  if (!start) return null;
  // periodStart can return "03a" on the autumn DST fold; parseInt reads its
  // numeral and stops at the suffix rather than failing outright.
  const hour = parseInt(start, 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

/**
 * Which monthly partition a run belongs in, from the UTC calendar — never
 * local time. `now` running local Europe/Warsaw time can already read as the
 * 1st while UTC still reads the 31st (23:30 UTC = 01:30 local in summer), and
 * a partition keyed on the wrong one would split one evening's readings
 * across two files for no reason a reader could see.
 */
export function archivePartition(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The partition immediately before the given one ("2026-01" -> "2025-12"),
 * for the one case a single partition cannot answer on its own: near the
 * start of a month, a business date up to ~5 days out may have had its
 * earliest snapshots archived while the run itself still fell in last month.
 */
export function previousPartition(partition: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(partition);
  if (!match) return partition;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Reads one partition's text back into "what was last archived for each
 * block" — the state `newArchiveLines` dedupes against.
 *
 * Any line that fails to parse or does not match the committed shape is
 * skipped rather than thrown on: an interrupted write can leave a truncated
 * last line, and losing one line's worth of dedupe state is a far smaller
 * fault than losing the whole run over it. Later lines win over earlier ones
 * for the same key, matching how the file was actually written — top to
 * bottom, oldest first.
 *
 * Accepts both the original six-element shape and the seven-element shape
 * that added `plannedExchange`: every line ever committed to the archive must
 * keep parsing, forever, or a month of history silently stops counting toward
 * dedupe state the moment the format grows a field. A six-element line reads
 * as `plannedExchange: null` — not "PSE reported zero", but "this line
 * predates the field entirely".
 */
export function parseArchiveLines(text: string): Map<ArchiveKey, ArchivedValue> {
  const result = new Map<ArchiveKey, ArchivedValue>();
  if (!text) return result;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let row: unknown;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!Array.isArray(row) || (row.length !== 6 && row.length !== 7)) continue;
    const [businessDate, hour, surplus, required, , , plannedExchangeRaw] = row as unknown[];

    if (typeof businessDate !== 'string' || !BUSINESS_DATE.test(businessDate)) continue;
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
      continue;
    }
    if (typeof surplus !== 'number' || !Number.isFinite(surplus)) continue;
    if (typeof required !== 'number' || !Number.isFinite(required)) continue;

    let plannedExchange: number | null = null;
    if (row.length === 7) {
      if (plannedExchangeRaw === null) plannedExchange = null;
      else if (typeof plannedExchangeRaw === 'number' && Number.isFinite(plannedExchangeRaw)) {
        plannedExchange = plannedExchangeRaw;
      } else continue; // seventh field present but malformed: skip, same as any other bad shape
    }

    result.set(archiveKey(businessDate, hour), [surplus, required, plannedExchange]);
  }

  return result;
}

/**
 * Which of this run's raw rows are worth appending, and the exact lines to
 * write for them.
 *
 * Dedupes on VALUE, not on PSE republishing the row: `(surplus, required,
 * plannedExchange)` has to differ from what `lastByKey` already holds for
 * that (business_date, hour) — a revision that touches only
 * `publication_ts_utc` with the same three figures is not news and must not
 * grow the file. The comparison is exact equality, not a tolerance: a swing
 * of exactly 1 MW is as real a change as one of 1000. `plannedExchange` is
 * deliberately IN the dedupe key, not left out of it: PSE has been observed
 * to publish the exchange figure for a block well after its surplus/required
 * settle, and that moment — the reserve forecast unchanged, only the
 * exchange arriving or moving — is exactly what this archive exists to
 * catch, so it must write a line even though the other two figures repeat.
 *
 * `lastByKey` is read, never mutated — the caller's map (typically freshly
 * built by `parseArchiveLines`) stays intact — but a local copy of it is
 * updated as rows are processed, so two rows in the same batch for the same
 * block dedupe against each other too, not only against what was already on
 * disk.
 */
export function newArchiveLines(
  rows: readonly PSERawItem[],
  lastByKey: ReadonlyMap<ArchiveKey, ArchivedValue>,
  nowIso: string
): string[] {
  const running = new Map(lastByKey);
  const lines: string[] = [];

  for (const row of rows) {
    const businessDate = row.business_date;
    if (typeof businessDate !== 'string' || !BUSINESS_DATE.test(businessDate)) continue;
    if (!isPlausibleBusinessDate(businessDate, nowIso)) continue;

    const hour = blockStartHour(row.period);
    if (hour === null) continue;

    const surplus = toNumber(row.surplus_cap_avail_tso);
    const required = toNumber(row.req_pow_res);
    if (surplus === null || required === null) continue;

    const plannedExchange = toNumber(row.planned_exchange);

    const key = archiveKey(businessDate, hour);
    const previous = running.get(key);
    if (
      previous &&
      previous[0] === surplus &&
      previous[1] === required &&
      previous[2] === plannedExchange
    ) {
      continue;
    }

    running.set(key, [surplus, required, plannedExchange]);

    // Not yet selected by api.ts's FORECAST_FIELDS (that list is shared with
    // the browser, and this field would cost every phone load to serve a
    // reading only this archive uses) — so on today's live rows this is
    // always ''. Read defensively regardless, so the day that field is added
    // this starts recording it with no further change here.
    const publicationTs = publicationTsToIso(
      (row as PSERawItem & { publication_ts_utc?: string }).publication_ts_utc
    );

    const line: ArchiveRow = [
      businessDate,
      hour,
      surplus,
      required,
      publicationTs,
      nowIso,
      plannedExchange,
    ];
    lines.push(JSON.stringify(line));
  }

  return lines;
}

/**
 * Folds any number of partition files into one last-value map, LATER TEXTS
 * WINNING duplicate keys. Exists so the two-partition month-boundary read is a
 * module concern with a test on it, not a spread expression inside the script:
 * a coordinator's spot mutation dropped the previous-partition read there and
 * every test stayed green — the failure it causes (re-archiving one unchanged
 * snapshot on the first runs of a month) is benign but silent.
 */
export function lastValuesFrom(texts: string[]): Map<ArchiveKey, ArchivedValue> {
  const folded = new Map<ArchiveKey, ArchivedValue>();
  for (const text of texts) {
    for (const [key, value] of parseArchiveLines(text)) {
      folded.set(key, value);
    }
  }
  return folded;
}
