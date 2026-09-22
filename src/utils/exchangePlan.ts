/**
 * Whether PSE's day-ahead plan for a day already carries a real cross-border
 * exchange — or only the placeholder it publishes before the day-ahead market
 * has cleared.
 *
 * Observed on the live pk5l-wp feed (07.09.2026 16:32): today and tomorrow
 * carry an hourly-varying exchange, +1.9 to +3.3 GW of import in the evening
 * peak; every day from D+2 to D+9 carries a flat −12 MW on all 24 hours, and
 * days beyond that a flat 0. The reserve for those days is therefore stated
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
 * The observed local-time window in which the exchange has arrived so far —
 * three measurements, all on D−1: 13:59 (01.09→02.09), 13:19 (06.09→07.09),
 * 13:15 (08.09→09.09). This is an observation of PSE's practice, NOT a rule
 * out of the regulations: nothing requires the day-ahead market to clear at
 * any particular minute, and a fourth measurement could easily fall outside
 * it. Kept here only as a documented, named constant so a caller wanting to
 * quote "so far always between X and Y" has one place to read the figures
 * from instead of copying them into prose by hand.
 */
export const EXCHANGE_ARRIVAL_OBSERVED_LOCAL = { earliest: '13:15', latest: '13:59' } as const;

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
