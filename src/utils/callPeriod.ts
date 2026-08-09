import { PSEDataPoint } from '../types';
import { CALL_PERIOD_EXEMPTION_MW, HOUR_MS } from './constants';

/**
 * Whether a call period could be declared for a given hour.
 *
 * The rules are written down, so this is arithmetic rather than judgement — and
 * that is the point: the assessment is computed here and merely *described* by
 * the language model, which therefore has nothing to invent.
 *
 * A call period is declared when, on a working day between 07:00 and 22:00, the
 * available reserve fails to cover what is required. The operator may still
 * refrain from declaring one if the surplus stays at or above
 * `CALL_PERIOD_EXEMPTION_MW` and it sees no threat to covering demand — the
 * second condition is a judgement we cannot observe, which is exactly why that
 * case is reported as `moderate` rather than `high`.
 */
export type CallPeriodRisk = 'high' | 'moderate' | 'none' | 'unknown';

/** First and last hour a call period can start at, inclusive. */
const WINDOW_FIRST_HOUR = 7;
/** 21:00-22:00 is the last block inside the 07:00-22:00 window. */
const WINDOW_LAST_HOUR = 21;

/** The operator must give at least this much notice, so a closer hour is settled. */
export const NOTICE_HOURS = 8;

export interface HourRisk {
  /** Hour the block starts, e.g. "19:00". */
  hourLabel: string;
  risk: CallPeriodRisk;
  /**
   * Whether a declaration could still arrive for this hour. False once the hour
   * is nearer than the required notice — at that point silence has settled it,
   * which is worth saying: it narrows the worry to hours it can still apply to.
   */
  announceable: boolean;
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm. Needed because four
 * Polish public holidays hang off it, and without them Corpus Christi or Easter
 * Monday would be counted as working days and the assessment would be wrong on
 * exactly the days people are most likely to be away.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const FIXED_HOLIDAYS = [
  [1, 1], // Nowy Rok
  [1, 6], // Trzech Króli
  [5, 1], // Święto Pracy
  [5, 3], // Święto Konstytucji 3 Maja
  [8, 15], // Wniebowzięcie NMP
  [11, 1], // Wszystkich Świętych
  [11, 11], // Święto Niepodległości
  [12, 25], // Boże Narodzenie
  [12, 26], // drugi dzień Bożego Narodzenia
] as const;

const pad = (value: number) => String(value).padStart(2, '0');
const iso = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** Public holidays for one year, as "YYYY-MM-DD". */
export function polishHolidays(year: number): Set<string> {
  const days = new Set(
    FIXED_HOLIDAYS.map(([month, day]) => iso(year, month, day))
  );

  const easter = easterSunday(year);
  // Arithmetic in UTC so no local timezone can shift a date across midnight.
  const easterUtc = Date.UTC(year, easter.month - 1, easter.day);
  const offsets = [
    0, // Wielkanoc
    1, // Poniedziałek Wielkanocny
    49, // Zielone Świątki
    60, // Boże Ciało
  ];

  for (const offset of offsets) {
    const date = new Date(easterUtc + offset * 24 * 60 * 60 * 1000);
    days.add(
      iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    );
  }

  return days;
}

/**
 * `businessDate` is PSE's own "YYYY-MM-DD" label for the day, so this works on
 * the string rather than on a Date — no local timezone can move the day.
 */
export function isWorkingDay(businessDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDate);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const weekday = new Date(
    Date.UTC(year, Number(monthText) - 1, Number(dayText))
  ).getUTCDay();

  if (weekday === 0 || weekday === 6) return false;
  return !polishHolidays(year).has(businessDate);
}

/** Hour the block starts, from "19:00" — NaN if the label is not one. */
function startHourOf(hourLabel: string): number {
  const match = /^(\d{1,2}):/.exec(hourLabel);
  return match ? Number(match[1]) : NaN;
}

export function classifyHour(point: PSEDataPoint, now: Date): HourRisk {
  const startHour = startHourOf(point.hourLabel);
  // `time` is the END of the block, which is what PSE stamps periods with.
  const startsAt = point.time.getTime() - HOUR_MS;
  const announceable =
    startsAt - now.getTime() >= NOTICE_HOURS * HOUR_MS;

  const base = { hourLabel: point.hourLabel, announceable };

  const inWindow =
    Number.isFinite(startHour) &&
    startHour >= WINDOW_FIRST_HOUR &&
    startHour <= WINDOW_LAST_HOUR;

  if (!isWorkingDay(point.businessDate) || !inWindow) {
    return { ...base, risk: 'none' };
  }

  if (point.reserve === null || point.required === null) {
    return { ...base, risk: 'unknown' };
  }

  if (point.reserve >= point.required) return { ...base, risk: 'none' };

  return {
    ...base,
    risk: point.reserve < CALL_PERIOD_EXEMPTION_MW ? 'high' : 'moderate',
  };
}

export interface CallPeriodRange {
  risk: 'high' | 'moderate';
  /** Hour the range starts, e.g. "17:00". */
  from: string;
  /** Hour the range ends at, e.g. "22:00" — the end of its last block. */
  to: string;
  hours: number;
  /** True while a declaration could still arrive for any hour in the range. */
  announceable: boolean;
}

/** Mirrors `stripIndex` in dataTransform: TypeScript narrows the accumulator to
 *  `never` outside the callback, which a rest destructure cannot be taken from. */
function stripIndex(range: CallPeriodRange & { lastIndex: number }): CallPeriodRange {
  const { lastIndex: _lastIndex, ...rest } = range;
  return rest;
}

/**
 * Blocks that have not finished yet.
 *
 * Hours already behind us carry nothing to act on — a declaration needs eight
 * hours' notice, so nothing can be done about them either way — and counting
 * them makes a day look dangerous at noon on the strength of a rough night that
 * is long over. `time` is the end of the block, so the hour in progress stays.
 */
export function upcoming(points: PSEDataPoint[], now: Date): PSEDataPoint[] {
  return points.filter((point) => point.time.getTime() > now.getTime());
}

/**
 * Consecutive hours of the same risk, merged, looking forward only. Reported as
 * ranges because "17:00-22:00" is what a person acts on; six separate hours is
 * the same fact in a form nobody reads.
 */
export function callPeriodRanges(
  points: PSEDataPoint[],
  now: Date
): CallPeriodRange[] {
  const ranges: CallPeriodRange[] = [];
  let current: (CallPeriodRange & { lastIndex: number }) | null = null;

  upcoming(points, now).forEach((point, index) => {
    const { risk, announceable } = classifyHour(point, now);
    const carries = risk === 'high' || risk === 'moderate';

    if (
      current &&
      (!carries || current.risk !== risk || current.lastIndex !== index - 1)
    ) {
      ranges.push(stripIndex(current));
      current = null;
    }

    if (!carries) return;

    if (current) {
      current.to = point.endLabel;
      current.hours += 1;
      current.lastIndex = index;
      // A range is still open to declaration while any of its hours is.
      current.announceable = current.announceable || announceable;
    } else {
      current = {
        risk,
        from: point.hourLabel,
        to: point.endLabel,
        hours: 1,
        announceable,
        lastIndex: index,
      };
    }
  });

  if (current) ranges.push(stripIndex(current));

  return ranges;
}

/** Worst risk present across a day, for a one-word verdict. */
export function worstRisk(ranges: CallPeriodRange[]): CallPeriodRisk {
  if (ranges.some((range) => range.risk === 'high')) return 'high';
  if (ranges.some((range) => range.risk === 'moderate')) return 'moderate';
  return 'none';
}
