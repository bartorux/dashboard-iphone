import type { PSERawItem } from '../types';
import { blockStartHour, isPlausibleBusinessDate } from './pk5lArchive';

/**
 * Our own archive of what pk5l-wp said about PV, wind and demand AT THE TIME
 * it was read — the same reason pk5lArchive exists, for three more fields.
 *
 * Started 28.10.2026 for an estimate of the cross-border exchange on days
 * PSE has not planned yet. Its backtest could only use PSE's FINAL forecasts
 * for past days (pk5l-wp keeps no versions), and with those a correction on
 * PV, wind and demand cut the error from 1.06 to 0.76 GW — an optimistic
 * figure, since two days ahead the forecasts are worse. Only readings taken
 * when they were live can say how much of that holds; this records them.
 *
 * Same rules as pk5lArchive: one partition per UTC month (archivePartition),
 * a line only when a value changed for its (businessDate, hour), the repeated
 * hour of the autumn DST fold left out (blockStartHour), business dates far
 * from the run skipped. Nothing reads it yet beyond its own tests.
 */

/** [businessDate, hour of the block's START (0-23), PV, wind, demand (MW, or null), readAt ISO]. */
export type OzeArchiveRow = readonly [
  businessDate: string,
  hour: number,
  pv: number | null,
  wind: number | null,
  demand: number | null,
  readAt: string,
];

type OzeValue = readonly [pv: number | null, wind: number | null, demand: number | null];

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

const keyOf = (businessDate: string, hour: number) => `${businessDate}#${hour}`;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

const sameValue = (a: OzeValue, b: OzeValue) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** The last value per (businessDate, hour) in one partition's text; a broken line is skipped. */
export function parseOzeArchiveLines(text: string): Map<string, OzeValue> {
  const last = new Map<string, OzeValue>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as unknown;
      if (!Array.isArray(row) || row.length !== 6) continue;
      const [businessDate, hour, pv, wind, demand] = row as unknown[];
      if (typeof businessDate !== 'string' || typeof hour !== 'number') continue;
      last.set(keyOf(businessDate, hour), [toNumber(pv), toNumber(wind), toNumber(demand)]);
    } catch {
      // One truncated line from an interrupted write must not cost the rest.
    }
  }
  return last;
}

/** Several partitions folded into one last-value map, LATER TEXTS WINNING (as lastValuesFrom). */
export function ozeLastValuesFrom(texts: string[]): Map<string, OzeValue> {
  const merged = new Map<string, OzeValue>();
  for (const text of texts) {
    for (const [key, value] of parseOzeArchiveLines(text)) merged.set(key, value);
  }
  return merged;
}

/**
 * The lines this run would append: one per (businessDate, hour) whose PV,
 * wind or demand differs from the last one on record — compared against a
 * running copy, so two rows of one batch for the same block dedupe too. A row
 * with none of the three is skipped: nothing to record.
 */
export function newOzeArchiveLines(
  rows: readonly PSERawItem[],
  lastByKey: ReadonlyMap<string, OzeValue>,
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

    const value: OzeValue = [
      toNumber(row.fcst_pv_tot_gen),
      toNumber(row.fcst_wi_tot_gen),
      toNumber(row.grid_demand_fcst),
    ];
    if (value.every((part) => part === null)) continue;

    const key = keyOf(businessDate, hour);
    const previous = running.get(key);
    if (previous && sameValue(previous, value)) continue;
    running.set(key, value);

    const line: OzeArchiveRow = [businessDate, hour, value[0], value[1], value[2], nowIso];
    lines.push(JSON.stringify(line));
  }
  return lines;
}
