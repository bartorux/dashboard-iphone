const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * PSE timestamps look like "2026-08-03 14:00:00". On the autumn DST switch the
 * hour can be a literal "03a" ("2025-10-26 03a:00:00"), which no Date parser
 * accepts — hence the hand-rolled regexes below.
 */
const PSE_STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}a?):(\d{2}):(\d{2})$/;
const PSE_UTC_STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local wall-clock stamp in the format the PSE $filter expects. */
export function formatDateTimeApi(date: Date): string {
  return `${formatDate(date)} ${pad(date.getHours())}:00:00`;
}

export function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Calendar-day arithmetic that survives 23- and 25-hour days. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Parse `plan_dtime_utc` into a real instant. This field — unlike `plan_dtime` —
 * is always a well-formed UTC stamp, which makes it the only safe basis for
 * ordering and gap detection across DST switches.
 */
export function parsePseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = PSE_UTC_STAMP.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number) as unknown as number[];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Rejects impossible dates like 2025-02-31, which Date.UTC would roll over
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/** "2026-08-03 14:00:00" -> "14:00", "2025-10-26 03a:00:00" -> "03a:00". */
export function formatHourLabel(timeStr: string): string {
  const match = PSE_STAMP.exec(timeStr);
  return match ? `${match[4]}:${match[5]}` : timeStr;
}

/**
 * PSE labels a period by its span, e.g. "19 - 20" for the block covering
 * 19:00-20:00. `plan_dtime` carries only the END of that span, so the period
 * field is the only place the start is stated - and the only way to display an
 * hour that matches the wall clock it describes.
 *
 * The autumn DST switch produces "03 - 03a" and "03a - 04"; the suffix has to
 * survive, otherwise the repeated hour collapses into one.
 */
const PSE_PERIOD = /^(\d{2}a?) - (\d{2}a?)$/;

export function periodStart(period: string): string | null {
  return PSE_PERIOD.exec(period)?.[1] ?? null;
}

export function periodEnd(period: string): string | null {
  const end = PSE_PERIOD.exec(period)?.[2];
  if (!end) return null;
  // The closing block is written "23 - 24"; midnight reads as 00.
  return end === '24' ? '00' : end;
}

/** Local wall-clock hour of an instant, as "HH:00". */
export function localHourLabel(date: Date): string {
  return `${pad(date.getHours())}:00`;
}

export function getDayDate(offset: number): string {
  return addDays(new Date(), offset).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
  });
}

const weekdayFormat = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'short',
  timeZone: 'UTC',
});

/**
 * "2026-08-12" -> "śr."
 *
 * Lives here rather than beside its first caller because the day tabs and the
 * AI analysis must name a day identically. They did not: the analysis said
 * "w środę" while the tab said "Pojutrze", two names for one day on one screen.
 *
 * UTC on purpose. A business date is a calendar label, not an instant, so
 * building it as local midnight would let a timezone west of UTC roll it back a
 * day.
 */
export function weekdayOf(businessDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDate);
  if (!match) return '';
  const [, year, month, day] = match;
  return weekdayFormat.format(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  );
}

/** The same, for a day expressed as an offset from today. */
export function weekdayForOffset(offset: number): string {
  return weekdayOf(formatDate(addDays(new Date(), offset)));
}

const spokenFormat = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'long',
  timeZone: 'UTC',
});

const dayMonthFormat = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** Monday-based week number, so "this week" means what a Polish reader means. */
function mondayOf(date: Date): number {
  const weekday = (date.getUTCDay() + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - weekday
  );
}

/**
 * How to say a date out loud without it meaning two different days.
 *
 * A bare weekday name is unambiguous only inside the current week. The day
 * window spans five WORKING days, so from Wednesday on it reaches over the
 * weekend — and then "w poniedziałek" describes both the Monday just gone and
 * the one six days out. Published on 11 August, a Tuesday: the card led with
 * "W poniedziałek o 20:00" about 17 August, and it was read as today.
 *
 * The name is settled here rather than left to the model, like every other
 * conclusion on this path: it copies what the facts call the day.
 */
export function spokenDay(businessDate: string, now: Date): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDate);
  if (!match) return '';

  const [, year, month, day] = match;
  const target = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const today = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );

  const days = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (days === 0) return 'dziś';
  if (days === 1) return 'jutro';

  const weekday = spokenFormat.format(target);
  return mondayOf(target) === mondayOf(today)
    ? weekday
    : `${weekday} ${dayMonthFormat.format(target)}`;
}
