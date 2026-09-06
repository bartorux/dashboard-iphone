import type { PSECompassRawItem } from '../types';
import type { CompassLevel } from './compass';
import { parseCompass } from './compass';
import { publicationTsToIso } from './dateHelpers';
import type { CompassVersionRow } from './badanieTypes';

/**
 * Our own hourly archive of Kompas Energetyczny (pdgsz): which level PSE had
 * PUBLISHED for each hour, and when, kept because PSE serves only the current
 * `is_active` version of each record and does not expose its own version
 * history through the live endpoint the app uses every hour.
 *
 * The research this feeds (badanie.ts, not this file) needs to know which
 * Kompas version was live at the moment a decision window closed — not just
 * what the compass says NOW. Without a running record of every version, that
 * question becomes unanswerable the instant PSE republishes a period, exactly
 * the gap pk5lArchive.ts exists to close for pk5l-wp's own revisions.
 *
 * Same split as pk5lArchive: this module is pure and trivially testable, the
 * partition math it depends on (`archivePartition`/`previousPartition`) is
 * reused from pk5lArchive rather than duplicated, and the actual reading and
 * writing of files lives only in scripts/summary.ts.
 */

/** [businessDate, hour] combined into the map key the parsers below return. */
type ArchiveKey = string;

/** The two values a line is deduped on: the level and PSE's publish stamp. */
interface ArchivedCompassValue {
  readonly level: CompassLevel;
  readonly publicationTsUtc: string;
}

/**
 * One archived line, in the exact order the format commits to: business date,
 * hour the block STARTS (0-23, local), the level PSE published for it,
 * PSE's own publication_ts_utc for that version (or '' when PSE sent none),
 * and the ISO instant this job read it.
 */
export type CompassArchiveRow = readonly [
  businessDate: string,
  hour: number,
  level: CompassLevel,
  publicationTsUtc: string,
  readAt: string,
];

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

function archiveKey(businessDate: string, hour: number): ArchiveKey {
  return `${businessDate}#${hour}`;
}

function isCompassLevel(value: unknown): value is CompassLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/**
 * One line, already split and trimmed, turned back into a typed row — or
 * `null` when it does not match the committed shape. The single place both
 * `parseCompassArchiveLines` (last-value-per-key) and `compassVersionRows`
 * (every version, in order) validate a line, so the two can never disagree
 * about what counts as well-formed.
 */
function parseLine(line: string): CompassArchiveRow | null {
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return null;
  }

  if (!Array.isArray(row) || row.length !== 5) return null;
  const [businessDate, hour, level, publicationTsUtc, readAt] = row as unknown[];

  if (typeof businessDate !== 'string' || !BUSINESS_DATE.test(businessDate)) return null;
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }
  if (!isCompassLevel(level)) return null;
  if (typeof publicationTsUtc !== 'string') return null;
  if (typeof readAt !== 'string') return null;

  return [businessDate, hour, level, publicationTsUtc, readAt];
}

/**
 * Which of this run's raw pdgsz rows are worth appending, and the exact
 * lines to write for them.
 *
 * Reuses `parseCompass` for the hour, the level and the business date — the
 * exact same extraction and validation the live card runs on the same rows —
 * rather than re-reading `dtime`/`dtime_utc`/`usage_fcst` a second time here.
 * Each row is passed to it ALONE (never the whole batch): `parseCompass`
 * itself keeps only the newest of several rows describing one instant, which
 * is exactly right for the live card but wrong for an archive whose entire
 * purpose is to keep every version rather than collapse them.
 *
 * Dedupes on (level, publicationTsUtc): a line is only worth writing when
 * either changed since `lastByKey`'s last archived value for that
 * (business_date, hour) — a row that changes neither carries no news, even
 * if PSE resent it. `lastByKey` is read, never mutated; a local copy is
 * updated as rows are processed so two rows in one batch for the same block
 * dedupe against each other too, not only against what was already on disk —
 * mirroring `newArchiveLines` in pk5lArchive.ts exactly.
 */
export function newCompassArchiveLines(
  rows: readonly PSECompassRawItem[],
  lastByKey: ReadonlyMap<ArchiveKey, ArchivedCompassValue>,
  readAt: string
): string[] {
  const running = new Map(lastByKey);
  const lines: string[] = [];

  for (const row of rows) {
    const [hour] = parseCompass([row]);
    if (!hour) continue;

    // hourLabel is always "HH:00" (compass.ts's hourLabelOf pattern), unlike
    // pk5l-wp's period which can carry a "03a" DST suffix — pdgsz's own dtime
    // never has been observed to.
    const hourNumber = Number(hour.hourLabel.slice(0, 2));
    const publicationTsUtc = publicationTsToIso(row.publication_ts_utc);

    const key = archiveKey(hour.businessDate, hourNumber);
    const previous = running.get(key);
    if (
      previous &&
      previous.level === hour.level &&
      previous.publicationTsUtc === publicationTsUtc
    ) {
      continue;
    }

    running.set(key, { level: hour.level, publicationTsUtc });

    const line: CompassArchiveRow = [
      hour.businessDate,
      hourNumber,
      hour.level,
      publicationTsUtc,
      readAt,
    ];
    lines.push(JSON.stringify(line));
  }

  return lines;
}

/**
 * Reads one partition's text back into "what was last archived for each
 * (business_date, hour)" — the state `newCompassArchiveLines` dedupes
 * against. A line that fails to parse or does not match the committed shape
 * is skipped rather than thrown on, same reasoning as pk5lArchive: an
 * interrupted write can leave a truncated last line, and losing one line's
 * dedupe state is far cheaper than losing the whole run over it. Later lines
 * win over earlier ones for the same key, matching append order.
 */
export function parseCompassArchiveLines(
  text: string
): Map<ArchiveKey, ArchivedCompassValue> {
  const result = new Map<ArchiveKey, ArchivedCompassValue>();
  if (!text) return result;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = parseLine(trimmed);
    if (!parsed) continue;

    const [businessDate, hour, level, publicationTsUtc] = parsed;
    result.set(archiveKey(businessDate, hour), { level, publicationTsUtc });
  }

  return result;
}

/**
 * Folds any number of partition files into one last-value map, later texts
 * winning duplicate keys — the month-boundary read as a tested module
 * concern rather than a spread expression inside the script. Mirrors
 * `lastValuesFrom` in pk5lArchive.ts.
 */
export function lastCompassValuesFrom(
  texts: string[]
): Map<ArchiveKey, ArchivedCompassValue> {
  const folded = new Map<ArchiveKey, ArchivedCompassValue>();
  for (const text of texts) {
    for (const [key, value] of parseCompassArchiveLines(text)) {
      folded.set(key, value);
    }
  }
  return folded;
}

/**
 * One partition's lines turned into the research contract's version rows —
 * EVERY version, in the order they were archived, not folded down to one per
 * key the way `parseCompassArchiveLines` is. The study needs to pick, for
 * each day's decision window, whichever version was live at that moment; that
 * choice is only possible if every version survives this read.
 *
 * `publishedAt` falls back to `readAt` when PSE sent no publication stamp: an
 * empty stamp does not mean the version has no moment it was true, only that
 * this is the best approximation this tool can make of it — the instant the
 * job itself observed the row is the closest thing to "when it became known"
 * that exists.
 */
export function compassVersionRows(text: string): CompassVersionRow[] {
  const rows: CompassVersionRow[] = [];
  if (!text) return rows;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = parseLine(trimmed);
    if (!parsed) continue;

    const [businessDate, hour, level, publicationTsUtc, readAt] = parsed;
    rows.push({
      businessDate,
      hour,
      level,
      publishedAt: publicationTsUtc || readAt,
    });
  }

  return rows;
}
