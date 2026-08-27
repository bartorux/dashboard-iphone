import { PSECompassRawItem } from '../types';
import { HOUR_MS } from './constants';
import { parsePseUtc } from './dateHelpers';

/**
 * PSE's Kompas Energetyczny (pdgsz) level for one hour.
 *
 * 0 recommended use, 1 normal, 2 recommended saving, 3 required limitation.
 * The operator publishes this for consumers, day by day; it is NOT the call
 * period, and nothing in this file may be read as one — see COMPASS_WORD.
 */
export type CompassLevel = 0 | 1 | 2 | 3;

export interface CompassHour {
  /** PSE's own label for the day, "YYYY-MM-DD". */
  businessDate: string;
  /** Instant the hour block STARTS, from dtime_utc. */
  startUtc: Date;
  /** Hour the block starts, "19:00" — taken from the local stamp, not derived. */
  hourLabel: string;
  level: CompassLevel;
}

/** Consecutive hours of one flagged level, merged into something a person acts on. */
export interface CompassRange {
  level: 2 | 3;
  /** Hour the range starts, e.g. "19:00". */
  from: string;
  /** Hour the range ends at, e.g. "21:00" — the end of its last block. */
  to: string;
  hours: number;
}

/**
 * The two flagged levels in the operator's own words.
 *
 * Levels 0 and 1 have no entry on purpose: "recommended use" and "normal" are
 * the absence of a signal, and a card line saying the compass is normal would
 * be news about nothing. Only a flag is news.
 */
export const COMPASS_WORD: Record<2 | 3, string> = {
  2: 'zalecane oszczędzanie',
  3: 'wymagane ograniczenie poboru',
};

const BARE_UTC_STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/**
 * pdgsz writes `dtime_utc` WITHOUT seconds ("2026-08-26 22:00"), exactly like
 * poze-redoze and unlike pk5l-wp's `plan_dtime_utc` ("2026-08-03 23:00:00")
 * that `parsePseUtc`'s regex was built for. Confirmed against a live response
 * fetched 2026-08-27: every one of the 48 published rows omitted seconds.
 * Padded here rather than by loosening the shared regex, so pk5l-wp's stricter
 * contract stays untouched for every other caller — the same choice made in
 * `redispatch.ts` for the same reason.
 */
function parseCompassInstant(dtimeUtc: string | null | undefined): Date | null {
  if (!dtimeUtc) return null;
  const padded = BARE_UTC_STAMP.test(dtimeUtc) ? `${dtimeUtc}:00` : dtimeUtc;
  return parsePseUtc(padded);
}

/**
 * The hour a block starts, read STRAIGHT OUT of the local `dtime` string.
 *
 * Deliberately not `startUtc.getHours()`: the scheduled job runs on a GitHub
 * runner whose clock is UTC, so in Polish summer time that would report 17:00
 * for a block PSE calls 19:00 — a two-hour error in the one field this card is
 * read for. `dtime` is already PSE's local wall clock, so the label is a
 * substring, not a conversion.
 *
 * Unlike pk5l-wp's `plan_dtime`, pdgsz stamps the START of the block: a
 * business day runs 00:00 through 23:00 (verified live on 2026-08-27, 24 rows
 * per published day). So this label needs no shifting either.
 */
function hourLabelOf(dtime: string | null | undefined): string | null {
  const match = /^\d{4}-\d{2}-\d{2} (\d{2}):(\d{2})$/.exec(dtime ?? '');
  return match ? `${match[1]}:${match[2]}` : null;
}

/** "19:00" -> "20:00", and "23:00" -> "00:00". Arithmetic, not a lookup: the
 *  end of a range is one hour past its last block and pdgsz never states it. */
function nextHourLabel(hourLabel: string): string {
  const hour = Number(hourLabel.slice(0, 2));
  return `${String((hour + 1) % 24).padStart(2, '0')}:00`;
}

function levelOf(usage: number | string): CompassLevel | null {
  const parsed = typeof usage === 'number' ? usage : Number(usage);
  return parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3
    ? (parsed as CompassLevel)
    : null;
}

/**
 * Turns raw pdgsz rows into one entry per hour, newest version winning.
 *
 * The endpoint versions its records: a period republished during the day keeps
 * its old rows and adds a new one, and `is_active` marks the current version.
 * The fetch already filters on that, so this deduplication is a second guard
 * rather than the first — if two active rows ever describe the same hour, the
 * later `publication_ts_utc` is the one PSE means. Keyed on the UTC instant,
 * never on the local label, because on the autumn DST switch the wall clock
 * reads "02:00" twice for two hours that are an hour apart.
 *
 * A row whose stamps cannot be read is skipped rather than guessed at.
 */
export function parseCompass(raw: PSECompassRawItem[]): CompassHour[] {
  const byInstant = new Map<number, { hour: CompassHour; published: string }>();

  for (const item of raw) {
    const startUtc = parseCompassInstant(item.dtime_utc);
    if (!startUtc) continue;

    const hourLabel = hourLabelOf(item.dtime);
    if (!hourLabel) continue;

    const level = levelOf(item.usage_fcst);
    if (level === null) continue;

    const key = startUtc.getTime();
    const published = item.publication_ts_utc ?? '';
    const held = byInstant.get(key);
    if (held && held.published > published) continue;

    byInstant.set(key, {
      hour: { businessDate: item.business_date, startUtc, hourLabel, level },
      published,
    });
  }

  return [...byInstant.values()]
    .map((entry) => entry.hour)
    .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
}

/**
 * Flagged hours still ahead, merged into ranges.
 *
 * Written for this data rather than reusing `callPeriodRanges`. That function
 * is the core of the critical path — it decides whether the card says a call
 * period may be declared — and it merges on adjacency in an ARRAY INDEX, which
 * only holds because its input is one day's continuous points. Here the input
 * spans days and may have holes where PSE published nothing, so continuity has
 * to be tested on the clock. Bending the shared function to fit would put this
 * layer's edge cases inside the one function that must never move.
 *
 * "Still ahead" follows `upcoming` in callPeriod: an hour counts while it has
 * not finished, so the hour in progress stays and a flag at 19:00 read at 19:30
 * is still worth saying. Nothing behind us can be acted on.
 */
export function compassRanges(hours: CompassHour[], now: Date): CompassRange[] {
  const ranges: CompassRange[] = [];
  let current: (CompassRange & { lastStartMs: number }) | null = null;

  const ahead = hours
    .filter((hour) => hour.startUtc.getTime() + HOUR_MS > now.getTime())
    .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());

  for (const hour of ahead) {
    // Only a flag is a range. Levels 0 and 1 say the operator asks nothing of
    // anyone, which is the state of almost every hour of almost every day —
    // and an unflagged hour CLOSES whatever was open rather than discarding it.
    // Written the other way at first, which silently swallowed every range that
    // ended before the last flagged hour of the set: a flag at 17:00 followed by
    // a calm 18:00 vanished from the card entirely.
    if (hour.level < 2) {
      if (current) ranges.push(strip(current));
      current = null;
      continue;
    }
    const level = hour.level as 2 | 3;
    const startMs = hour.startUtc.getTime();

    // Same flag AND the very next hour. A gap — an unflagged hour between two
    // flagged ones, or a day boundary PSE did not publish across — splits the
    // range, or the card would report a span nobody is being asked to keep.
    if (current && (current.level !== level || startMs - current.lastStartMs !== HOUR_MS)) {
      ranges.push(strip(current));
      current = null;
    }

    if (current) {
      current.to = nextHourLabel(hour.hourLabel);
      current.hours += 1;
      current.lastStartMs = startMs;
    } else {
      current = {
        level,
        from: hour.hourLabel,
        to: nextHourLabel(hour.hourLabel),
        hours: 1,
        lastStartMs: startMs,
      };
    }
  }

  if (current) ranges.push(strip(current));

  return ranges;
}

/** Mirrors `stripIndex` in callPeriod: TypeScript narrows the accumulator to
 *  `never` outside the loop, which a rest destructure cannot be taken from. */
function strip(range: CompassRange & { lastStartMs: number }): CompassRange {
  const { lastStartMs: _lastStartMs, ...rest } = range;
  return rest;
}
