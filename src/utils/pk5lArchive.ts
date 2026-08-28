import type { PSERawItem } from '../types';
import { periodStart } from './dateHelpers';

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

/** The two values a line is deduped on: [surplus, required], both in MW. */
type ArchivedValue = readonly [surplus: number, required: number];

/**
 * One archived line, in the exact order the format commits to:
 * [businessDate, hour of the block's START (0-23), surplus, required,
 * PSE's own publication_ts_utc for the row (or '' when PSE did not send
 * one), and the ISO instant this job read it].
 */
export type ArchiveRow = readonly [
  businessDate: string,
  hour: number,
  surplus: number,
  required: number,
  publicationTsUtc: string,
  readAt: string,
];

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PSE_PUBLICATION_STAMP =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;

function archiveKey(businessDate: string, hour: number): ArchiveKey {
  return `${businessDate}#${hour}`;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * PSE's own publication stamp for a row ("2026-08-28 16:42:11.322", space-
 * separated, fractional seconds included) turned into the compact form this
 * archive stores ("2026-08-28T16:42:11Z"). '' when the row carries none, or
 * when it does not parse — never thrown, since a missing publication stamp
 * must not cost the archive the reading itself.
 */
function toIsoUtc(value: string | undefined): string {
  if (!value) return '';
  const match = PSE_PUBLICATION_STAMP.exec(value);
  if (!match) return '';
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
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

    if (!Array.isArray(row) || row.length !== 6) continue;
    const [businessDate, hour, surplus, required] = row as unknown[];

    if (typeof businessDate !== 'string' || !BUSINESS_DATE.test(businessDate)) continue;
    if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
      continue;
    }
    if (typeof surplus !== 'number' || !Number.isFinite(surplus)) continue;
    if (typeof required !== 'number' || !Number.isFinite(required)) continue;

    result.set(archiveKey(businessDate, hour), [surplus, required]);
  }

  return result;
}

/**
 * Which of this run's raw rows are worth appending, and the exact lines to
 * write for them.
 *
 * Dedupes on VALUE, not on PSE republishing the row: `(surplus, required)`
 * has to differ from what `lastByKey` already holds for that
 * (business_date, hour) — a revision that touches only `publication_ts_utc`
 * with the same two figures is not news and must not grow the file. The
 * comparison is exact equality, not a tolerance: a swing of exactly 1 MW is
 * as real a change as one of 1000.
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

    const hour = blockStartHour(row.period);
    if (hour === null) continue;

    const surplus = toNumber(row.surplus_cap_avail_tso);
    const required = toNumber(row.req_pow_res);
    if (surplus === null || required === null) continue;

    const key = archiveKey(businessDate, hour);
    const previous = running.get(key);
    if (previous && previous[0] === surplus && previous[1] === required) continue;

    running.set(key, [surplus, required]);

    // Not yet selected by api.ts's FORECAST_FIELDS (that list is shared with
    // the browser, and this field would cost every phone load to serve a
    // reading only this archive uses) — so on today's live rows this is
    // always ''. Read defensively regardless, so the day that field is added
    // this starts recording it with no further change here.
    const publicationTs = toIsoUtc(
      (row as PSERawItem & { publication_ts_utc?: string }).publication_ts_utc
    );

    const line: ArchiveRow = [businessDate, hour, surplus, required, publicationTs, nowIso];
    lines.push(JSON.stringify(line));
  }

  return lines;
}
