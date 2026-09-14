import type {
  PriceArchiveRow,
  PriceDay,
  PriceHour,
  PriceSource,
  PricesFile,
} from './cenyTypes';

/**
 * Turns one pradcast `/prices/date/{date}` response into `PriceDay`, or
 * `null` for the whole day on anything that does not check out.
 *
 * All-or-nothing on purpose: a strip drawn from a partially-trusted day would
 * show real hours next to made-up gaps with no visual difference between
 * them, and pradcast has already been seen to answer with a `source` this
 * code does not know (see `normalizeSource`). A day that fails to parse
 * simply does not appear — which the caller already treats as normal, since
 * pradcast may not have D+3 yet either.
 *
 * `horizon`/`confidence` are handled differently from a bad hour: pradcast's
 * own schema marks both nullable, and this code additionally treats any value
 * outside the enum cenyTypes commits to as unknown — but neither failure
 * spoils the day, because the chart never reads them for a confirmed day and
 * a forecast day is still worth drawing with an unlabelled band.
 */
export function normalizeDay(payload: unknown): PriceDay | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = payload as Record<string, unknown>;

  const date = raw.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const source = normalizeSource(raw.source);
  if (!source) return null;

  const rawHours = raw.prices;
  if (!Array.isArray(rawHours) || rawHours.length === 0) return null;

  const hours: PriceHour[] = [];
  for (const item of rawHours) {
    const hour = normalizeHour(item, source);
    // One bad hour (an out-of-range hour, a price that is not a number) taints
    // the whole day: see the function comment for why this is all-or-nothing.
    if (!hour) return null;
    hours.push(hour);
  }

  return {
    date,
    source,
    // Forced null on a confirmed day regardless of what pradcast sent — the
    // contract (cenyTypes.ts) says a confirmed day carries neither, and the
    // live endpoint agrees: `horizon`/`confidence` are simply absent from a
    // `tge_fixing1` response rather than present as null.
    horizon: source === 'confirmed' ? null : normalizeHorizon(raw.horizon),
    confidence: source === 'confirmed' ? null : normalizeConfidence(raw.confidence),
    hours,
  };
}

function normalizeSource(value: unknown): PriceSource | null {
  if (value === 'tge_fixing1') return 'confirmed';
  if (value === 'forecast_model') return 'forecast';
  return null;
}

const HORIZONS = new Set(['D+1', 'D+2', 'D+3']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);

function normalizeHorizon(value: unknown): PriceDay['horizon'] {
  return typeof value === 'string' && HORIZONS.has(value)
    ? (value as PriceDay['horizon'])
    : null;
}

function normalizeConfidence(value: unknown): PriceDay['confidence'] {
  return typeof value === 'string' && CONFIDENCES.has(value)
    ? (value as PriceDay['confidence'])
    : null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeHour(item: unknown, source: PriceSource): PriceHour | null {
  if (typeof item !== 'object' || item === null) return null;
  const raw = item as Record<string, unknown>;

  const hour = raw.hour;
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }

  const price = raw.price;
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;

  if (source === 'confirmed') {
    // p10/p90 forced null even if pradcast happened to send numbers here — a
    // settled TGE fixing has no band, whatever the field says.
    return { hour, price, p10: null, p90: null };
  }

  return { hour, price, p10: toFiniteNumber(raw.p10), p90: toFiniteNumber(raw.p90) };
}

function sameHour(a: PriceHour, b: PriceHour): boolean {
  return a.hour === b.hour && a.price === b.price && a.p10 === b.p10 && a.p90 === b.p90;
}

function sameDay(a: PriceDay, b: PriceDay): boolean {
  return (
    a.date === b.date &&
    a.source === b.source &&
    a.horizon === b.horizon &&
    a.confidence === b.confidence &&
    a.hours.length === b.hours.length &&
    a.hours.every((hour, index) => sameHour(hour, b.hours[index]))
  );
}

function sameDays(a: readonly PriceDay[], b: readonly PriceDay[]): boolean {
  return a.length === b.length && a.every((day, index) => sameDay(day, b[index]));
}

/**
 * Builds the file `public/ceny.json` becomes, keeping `changedAt` frozen
 * unless `days` actually differs from `previous`.
 *
 * This is the whole reason a quiet poll can leave the file byte-identical
 * (see cenyTypes.ts): the generator calls pradcast every run, but nothing
 * downstream — the deploy gate, the service worker — may see that as a
 * change unless a number on the strip actually moved.
 */
export function pricesFile(
  days: PriceDay[],
  previous: PricesFile | null,
  now: Date
): PricesFile {
  const changedAt =
    previous && sameDays(previous.days, days) ? previous.changedAt : now.toISOString();

  return { changedAt, source: 'pradcast.pl', days };
}

const ARCHIVE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads a monthly archive file back into "the last hourly row on record per
 * date" — later lines win, matching how the file is written (append-only,
 * oldest first). A malformed line is skipped rather than thrown on: the same
 * defensiveness `pk5lArchive.parseArchiveLines` uses for the same reason, an
 * interrupted write must cost at most one line, never the whole run.
 */
function lastHourlyByDate(existingText: string): Map<string, number[]> {
  const result = new Map<string, number[]>();
  if (!existingText) return result;

  for (const line of existingText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let row: unknown;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!Array.isArray(row) || row.length !== 3) continue;
    const [date, hourly, archivedAt] = row as unknown[];

    if (typeof date !== 'string' || !ARCHIVE_DATE.test(date)) continue;
    if (typeof archivedAt !== 'string') continue;
    if (
      !Array.isArray(hourly) ||
      hourly.length !== 24 ||
      !hourly.every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      continue;
    }

    result.set(date, hourly as number[]);
  }

  return result;
}

/** Whether two 24-slot price arrays are identical, hour for hour. */
function sameHourly(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * A confirmed day's prices, reindexed by hour, or `null` if the day does not
 * actually cover the 24 distinct hours a settled day needs — the archive's
 * own reason to exist is comparing one evening peak against another, which a
 * short or overlapping day cannot honestly do.
 */
function hourlyOf(day: PriceDay): number[] | null {
  if (day.hours.length !== 24) return null;

  const hourly = new Array<number | null>(24).fill(null);
  for (const hour of day.hours) {
    if (hour.hour < 0 || hour.hour > 23) return null;
    hourly[hour.hour] = hour.price;
  }

  // No separate duplicate check needed: with exactly 24 entries and every
  // `hour` confined to 0-23, a repeated hour can only be reached by leaving
  // some other slot unset — the pigeonhole makes the two failures the same
  // one, and this is the check that catches it.
  return hourly.every((value): value is number => value !== null) ? hourly : null;
}

/**
 * The archive lines this run should append — only for confirmed days with a
 * full 24-hour set, and only when the prices actually differ from whatever
 * `existingText` already has for that date.
 *
 * Forecast days are never archived (see cenyTypes.ts on `PriceArchiveRow`):
 * pradcast's model estimate is not the fact this archive exists to keep, and
 * the same date reappears here once it settles.
 */
export function archiveLines(
  days: PriceDay[],
  existingText: string,
  now: Date
): string[] {
  const lastByDate = lastHourlyByDate(existingText);
  const lines: string[] = [];

  for (const day of days) {
    if (day.source !== 'confirmed') continue;

    const hourly = hourlyOf(day);
    if (!hourly) continue;

    const previous = lastByDate.get(day.date);
    if (previous && sameHourly(previous, hourly)) continue;

    const row: PriceArchiveRow = [day.date, hourly, now.toISOString()];
    lines.push(JSON.stringify(row));

    // Advances the running state so two days for the same date within one
    // batch dedupe against each other too, not only against disk — mirrors
    // `newArchiveLines` in pk5lArchive.ts for the identical reason.
    lastByDate.set(day.date, hourly);
  }

  return lines;
}
