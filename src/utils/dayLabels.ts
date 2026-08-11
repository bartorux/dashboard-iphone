/**
 * Names for the days a summary covers, worked out when it is read rather than
 * when it is written.
 *
 * The file stores plain dates, never a finished phrase: a summary written at
 * 23:50 and opened after midnight would carry a label saying "today" about a day
 * that has since become yesterday. Resolving against the reader's own clock
 * cannot drift, and when the text really is stale the label says so — which is
 * the honest outcome, not a bug to paper over.
 */
import { weekdayOf } from './dateHelpers';

const RELATIVE = ['dziś', 'jutro', 'pojutrze'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar date as "YYYY-MM-DD" — the same shape PSE labels days with. */
export function localDate(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/** Whole days from today to `businessDate`, negative for the past. */
function offsetOf(businessDate: string, today: string): number | null {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match
      ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : null;
  };

  const target = parse(businessDate);
  const base = parse(today);
  if (target === null || base === null) return null;

  return Math.round((target - base) / DAY_MS);
}

function nameOf(businessDate: string, today: string): string | null {
  const offset = offsetOf(businessDate, today);
  if (offset === null) return null;
  if (offset >= 0 && offset < RELATIVE.length) return RELATIVE[offset];

  /*
   * Ahead of today but past the words this table holds: the weekday, the same
   * one the tabs and the summary itself use. A bare date was right while the app
   * knew three days and reads as a stumble now that it knows five —
   * "dziś–14.08" mixes a word with a number for no reason a reader can see.
   *
   * Only forwards, and only within the week. Backwards a weekday lies by
   * omission: "sob." cannot say whether it means the Saturday just gone or the
   * one coming, and this label exists precisely for the case of a stale file
   * read the next morning.
   */
  if (offset > 0 && offset < 7) {
    const weekday = weekdayOf(businessDate);
    if (weekday) return weekday;
  }

  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(businessDate);
  return match ? `${Number(match[2])}.${match[1]}` : null;
}

/**
 * A range like "dziś–pojutrze", or a single name when the summary covers one
 * day — which happens late in the evening, once today is spent.
 */
export function dayRangeLabel(dates: string[], now: Date): string | null {
  if (dates.length === 0) return null;

  const today = localDate(now);
  const sorted = [...dates].sort();
  const first = nameOf(sorted[0], today);
  const last = nameOf(sorted[sorted.length - 1], today);

  if (!first || !last) return null;
  return first === last ? first : `${first}–${last}`;
}
