import { addDays, formatDate, getDayDate, weekdayForOffset } from './dateHelpers';
import { isWorkingDay } from './callPeriod';

/**
 * Which days the app offers, as offsets from today.
 *
 * Five working days, because that is the horizon shifts are actually planned
 * over. PSE publishes fifty-one days ahead with real hourly variation, but how
 * accurate a forecast is that far out cannot be checked from a single snapshot —
 * it would take comparing successive publications of the same day — so the
 * window is set by what someone can act on, not by what the API will serve.
 *
 * Days off are skipped: a call period is only ever declared on a working day
 * between 07:00 and 22:00, so a Saturday chart carries nothing to act on. Today
 * is the exception and always appears, weekend or not — otherwise on a Saturday
 * there would be no way to look at the current day at all.
 *
 * The offsets are therefore NOT contiguous. Anything stepping through days has
 * to walk this list rather than add one to an offset.
 */
export const WORKING_DAYS_AHEAD = 5;

/** Enough to clear a weekend plus a run of holidays; a runaway loop guard. */
const MAX_OFFSET = 14;

export function visibleDayOffsets(
  now: Date,
  workingDays = WORKING_DAYS_AHEAD
): number[] {
  const offsets = [0];
  let counted = isWorkingDay(formatDate(now)) ? 1 : 0;

  for (let offset = 1; counted < workingDays && offset <= MAX_OFFSET; offset++) {
    if (!isWorkingDay(formatDate(addDays(now, offset)))) continue;
    offsets.push(offset);
    counted += 1;
  }

  return offsets;
}

/**
 * The same days as business-date strings, which is how PSE labels them and how
 * the analysis groups its facts.
 *
 * Exists so the tabs and the summary cannot disagree about which days the app is
 * talking about. The summary used to take the first three days chronologically,
 * which quietly included a weekend the tabs skip.
 */
export function visibleBusinessDates(now: Date): string[] {
  return visibleDayOffsets(now).map((offset) => formatDate(addDays(now, offset)));
}

/** Calendar days the window spans, which is what the API has to be asked for. */
export function daysToFetch(now: Date): number {
  const offsets = visibleDayOffsets(now);
  return offsets[offsets.length - 1] + 1;
}

/**
 * "Dziś", then the weekday — the same name the analysis uses for that day.
 *
 * Until now the tab said "Pojutrze" while the analysis said "w środę": two ways
 * of naming one day on one screen. Weekday names are also the narrower of the
 * two, which is what makes five days fit on a phone where three barely did.
 */
export function dayLabel(offset: number): string {
  return offset === 0 ? 'Dziś' : weekdayForOffset(offset);
}

/** Label and date, as the day tabs show them. */
export function dayTab(offset: number): { label: string; sublabel: string } {
  return { label: dayLabel(offset), sublabel: getDayDate(offset) };
}
