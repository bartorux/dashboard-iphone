import { RedispatchHour } from './redispatch';

export interface RedispatchCacheEntry {
  rows: RedispatchHour[];
  validUntil: number;
}

export type RedispatchCache = Record<string, RedispatchCacheEntry>;

/**
 * A day that actually saw curtailment is settled once PSE publishes it — an
 * hour is generous.
 *
 * A day with nothing to report gets a much shorter TTL: a future business
 * date has no redispatch published yet by definition, and without a short
 * expiry it would still be worth caching for an hour, which reads as "no
 * curtailment today" long after PSE has actually started publishing it.
 * Fifteen minutes matches the app's own refresh interval instead.
 */
export const REDISPATCH_TTL_NONEMPTY_MS = 60 * 60 * 1000;
export const REDISPATCH_TTL_EMPTY_MS = 15 * 60 * 1000;

export function redispatchTtlMs(rows: RedispatchHour[]): number {
  return rows.length > 0 ? REDISPATCH_TTL_NONEMPTY_MS : REDISPATCH_TTL_EMPTY_MS;
}

/** Tolerates missing storage, junk JSON, or a shape from a future version. */
export function parseRedispatchCache(raw: string | null | undefined): RedispatchCache {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as RedispatchCache)
      : {};
  } catch {
    return {};
  }
}

/** Null both when the day was never cached and when its entry has expired. */
export function readCachedRedispatch(
  cache: RedispatchCache,
  businessDate: string,
  now: number
): RedispatchHour[] | null {
  const entry = cache[businessDate];
  if (!entry || now >= entry.validUntil) return null;
  return entry.rows;
}

/**
 * Returns a new cache with one day written (or refreshed) and every entry
 * outside `keepDates` dropped.
 *
 * The user switches between up to five day tabs, each triggering its own
 * fetch and its own cache entry — without pruning, a week of browsing would
 * leave a week of dead entries sitting in storage forever, none of them ever
 * read again once their day scrolled out of the window.
 */
export function withRedispatchEntry(
  cache: RedispatchCache,
  businessDate: string,
  rows: RedispatchHour[],
  now: number,
  keepDates: readonly string[]
): RedispatchCache {
  const keep = new Set(keepDates);
  keep.add(businessDate);

  const next: RedispatchCache = {};
  for (const [date, entry] of Object.entries(cache)) {
    if (keep.has(date)) next[date] = entry;
  }
  next[businessDate] = { rows, validUntil: now + redispatchTtlMs(rows) };
  return next;
}
