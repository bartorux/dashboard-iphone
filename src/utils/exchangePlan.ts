/**
 * Whether PSE's day-ahead plan for a day already carries a real cross-border
 * exchange — or only the placeholder it publishes before the day-ahead market
 * has cleared.
 *
 * Observed on the live pk5l-wp feed (07.09.2026 16:32): today and tomorrow
 * carry an hourly-varying exchange, +1.9 to +3.3 GW of import in the evening
 * peak; every day from D+2 to D+9 carries a flat −12 MW on all 24 hours, and
 * days beyond that a flat 0. Tomorrow only from the afternoon: in 32 of 32
 * archive snapshots at 09:00 and 12:00 (09.09–25.10) it still carried the
 * placeholder — its plan is published on D−1 at 13:02–13:22. The reserve for those days is therefore stated
 * WITHOUT any exchange at all — 09.09 showed 49 MW of reserve at 19:00 for
 * exactly this reason. Import so far, but the owner's caution stands: an
 * export day would move the reserve the other way, so no direction is
 * assumed anywhere this helper is used. The exchange for
 * day D arrives on D−1 once the day-ahead market clears, around 13:00 local
 * (seen at 13:59 on 01.09, 13:19 on 06.09, and 13:15 on 08.09 — the last one
 * a single reading jumping from 49 to 877 MW of reserve, −12 to 2941 MW of
 * exchange): a jump of 2–3 GW in one write.
 *
 * "Planned" is decided from the data, never from the clock — by the size of
 * the day's largest exchange, not by whether the hours differ. The first
 * version asked for two different values, on the reading that the placeholder
 * was one flat figure; from about 07.09 PSE began publishing a placeholder that
 * varies by a few megawatts (24.09 as seen on 22.09: −9, −14, −17 and −18 MW),
 * and the day passed for planned. The card then warned about Thursday's deficit
 * with no word about the missing import.
 */
export function exchangePlanned(points: ReadonlyArray<{ exchange: number | null }>): boolean {
  return exchangePeakMw(points) >= EXCHANGE_PLAN_MIN_PEAK_MW;
}

/**
 * Business dates still waiting for PSE's exchange plan: days that have
 * readings but whose own hours carry only the placeholder — judged per day,
 * exactly as `exchangePlanned` judges one. A date with no readings at all is
 * left out: nothing fetched yet is not "unplanned".
 *
 * The owner's rule of 22.09.2026, implemented 28.10: such days are assessed
 * "wstępnie" — marked on their tab, muted in Alerts and kept out of the app
 * badge. Measured on 22 working days of the archive: without the plan the
 * evening margin (17–21) reads 1.0–1.4 GW low, and in 6 of them every negative
 * hour was gone once the plan arrived.
 */
export function datesAwaitingExchangePlan(
  points: ReadonlyArray<{ businessDate: string; exchange: number | null; reserve: number | null }>
): Set<string> {
  const byDate = new Map<string, Array<{ exchange: number | null; reserve: number | null }>>();
  for (const point of points) {
    const day = byDate.get(point.businessDate);
    if (day) day.push(point);
    else byDate.set(point.businessDate, [point]);
  }
  const awaiting = new Set<string>();
  for (const [date, day] of byDate) {
    if (day.some((point) => point.reserve !== null) && !exchangePlanned(day)) awaiting.add(date);
  }
  return awaiting;
}

/**
 * Where the placeholder ends and a real plan begins, as the day's largest
 * |exchange|.
 *
 * Measured on the September archive (22.09.2026): of 5114 readings taken
 * before noon on D−1 — placeholder by construction — the largest day peak was
 * 408 MW; of 1890 taken after 15:00 on D−1, with the plan in, the smallest was
 * 1033 MW. The threshold sits in that gap. Should a real plan ever peak below
 * it, the day reads as not yet planned — the cautious side, a caveat too many
 * rather than a deficit shown as settled.
 */
export const EXCHANGE_PLAN_MIN_PEAK_MW = 700;

function exchangePeakMw(points: ReadonlyArray<{ exchange: number | null }>): number {
  let peak = 0;
  for (const point of points) {
    if (point.exchange !== null && Number.isFinite(point.exchange)) {
      peak = Math.max(peak, Math.abs(point.exchange));
    }
  }
  return peak;
}

/**
 * The same question asked of the archive: was the day planned at the moment of
 * each reading? Keyed by `readAt`.
 *
 * Answered for the WHOLE DAY as it stood at that moment — every hour's latest
 * row at or before it — never from the one hour a reading happens to describe.
 * A single hour cannot tell: a real plan swings through zero around midday and
 * at night (the same measurement: 5423 of 18561 planned-day readings of hours
 * 7–21 at 408 MW or less, 628 at 15 MW or less), while the placeholder now
 * exceeds 15 MW on some hours (7746 of 67575 readings). The archive keeps a row
 * only when a value changes, so a day's first reading carries all its hours and
 * the state is complete from there on.
 *
 * A day whose rows carry no exchange at all (archived before the column
 * existed) reads as planned, because nothing can be said about it either way.
 */
export function plannedByReading(
  rows: ReadonlyArray<{ hour: number; readAt: string; exchange: number | null }>
): Map<string, boolean> {
  const byTime = [...rows].sort((a, b) => Date.parse(a.readAt) - Date.parse(b.readAt));
  const state = new Map<number, number | null>();
  const result = new Map<string, boolean>();
  for (let index = 0; index < byTime.length; index++) {
    const row = byTime[index];
    state.set(row.hour, row.exchange);
    const next = byTime[index + 1];
    if (next && next.readAt === row.readAt) continue;
    const known = [...state.values()].filter((value) => value !== null);
    result.set(
      row.readAt,
      known.length === 0 || exchangePlanned(known.map((exchange) => ({ exchange })))
    );
  }
  return result;
}

/**
 * Fallback only, for a reading serialized before `plannedByReading` existed:
 * the same question for ONE hour's exchange, which — see above — it cannot
 * answer reliably. `null` (rows archived before the column existed) is
 * treated as planned.
 */
export const EXCHANGE_PLACEHOLDER_ABS_MW = 15;

export function readingHasExchange(exchange: number | null | undefined): boolean {
  if (exchange === null || exchange === undefined) return true;
  return Math.abs(exchange) > EXCHANGE_PLACEHOLDER_ABS_MW;
}

/**
 * The observed local-time window in which the exchange arrives — on D−1.
 * Measured on 31 days with quarter-hourly readings (09.09–26.10.2026): PSE's
 * publication stamp fell at 13:02–13:22 on 29 of them (13:42 for 25.10, the
 * DST day, and 13:15 for 26.10), and our first reading carrying it at
 * 13:13–13:45. An observation of PSE's practice, NOT a rule: nothing requires
 * the day-ahead market to clear at any particular minute. One place for the
 * figures, so no sentence on screen copies them by hand (two did, quoting the
 * first three measurements, "13:15 a 14:00", long after they stopped being the
 * best ones).
 */
export const EXCHANGE_ARRIVAL_OBSERVED_LOCAL = { earliest: '13:00', latest: '13:45' } as const;

const pad2 = (value: number) => String(value).padStart(2, '0');
const isoLocal = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * The sentence that tells the reader why a day is assessed "wstępnie" — and
 * when that ends. The plan for day D arrives on D−1, so the sentence names
 * that day: "w czw. 29.10", "dziś", or, once today's window has closed with
 * nothing in it, that the plan is late. Local wall clock, like every other
 * time on screen.
 *
 * The figures in the second clause are the archive's medians over 22 working
 * days (28.10.2026): evening 17–21 understated by 1.0–1.4 GW, midday
 * overstated, because Poland exports then.
 */
export function provisionalCaveat(businessDate: string, now: Date): string {
  const { earliest, latest } = EXCHANGE_ARRIVAL_OBSERVED_LOCAL;
  const [year, month, day] = businessDate.split('-').map(Number);
  const dayBefore = new Date(year, month - 1, day - 1);
  const today = isoLocal(now);
  const publishedOn = isoLocal(dayBefore);
  const nowClock = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const effect = 'margines wieczorem jest zwykle zaniżony o 1–1,4 GW, a w południe zawyżony';

  const late = publishedOn < today || (publishedOn === today && nowClock >= latest);
  if (late) {
    return `Ocena wstępna: rezerwa jest liczona bez importu — plan wymiany z zagranicą na tę dobę jeszcze nie doszedł (zwykle do ${latest}). Do tego czasu ${effect}.`;
  }

  let when = 'dziś';
  if (publishedOn !== today) {
    const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(dayBefore);
    // "we wt.", like "we wtorek"; "w" before every other day.
    const preposition = weekday.startsWith('wt') ? 'we' : 'w';
    when = `${preposition} ${weekday} ${pad2(dayBefore.getDate())}.${pad2(dayBefore.getMonth() + 1)}`;
  }
  return `Ocena wstępna: rezerwa jest liczona bez importu, bo PSE poda plan wymiany z zagranicą na tę dobę dopiero ${when} około ${earliest}–${latest} — do tego czasu ${effect}.`;
}

/**
 * The moment a day's readings first show a real exchange after having shown
 * only the placeholder — i.e. `readAt` of the first reading, in a series
 * ordered oldest first, that is `planned` (see `plannedByReading`) AND that is
 * preceded somewhere earlier in the series by a reading that was not.
 *
 * `null` in two different situations that this function deliberately does not
 * tell apart (the caller does, from the day's own last reading and its
 * `planned`): the day had a real exchange from its very
 * first reading (nothing ever arrived, because there was nothing to wait
 * for), or the day still shows only the placeholder and the transition has
 * not happened yet (nothing arrived YET). Both read as "no arrival moment to
 * report" from this function's own point of view — it only ever answers "when
 * did it change", never "has it changed".
 *
 * See `EXCHANGE_ARRIVAL_OBSERVED_LOCAL` for what "arrives" has meant in
 * practice so far.
 */
export function exchangeArrivedAt(
  readings: ReadonlyArray<{ readAt: string; planned: boolean }>
): string | null {
  let sawPlaceholder = false;
  for (const reading of readings) {
    if (reading.planned) {
      if (sawPlaceholder) return reading.readAt;
    } else {
      sawPlaceholder = true;
    }
  }
  return null;
}
