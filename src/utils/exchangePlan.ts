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
 * "Planned" is decided from the data, never from the clock: a day whose 24
 * hours all share one exchange value has not been planned yet. A real plan
 * varies hour by hour.
 */
export function exchangePlanned(points: ReadonlyArray<{ exchange: number | null }>): boolean {
  const values = new Set<number>();
  for (const point of points) {
    if (point.exchange !== null && Number.isFinite(point.exchange)) values.add(point.exchange);
  }
  return values.size >= 2;
}

/**
 * The same question for ONE archived reading, which knows only its own hour's
 * exchange. The placeholder is small (0 or −12 MW) and a real evening-peak
 * exchange is thousands, so a magnitude test is the honest proxy; `null`
 * (rows archived before the column existed) is treated as planned, because
 * nothing can be said about them either way.
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
 * ordered oldest first, that `readingHasExchange` AND that is preceded
 * somewhere earlier in the series by a reading that did not.
 *
 * `null` in two different situations that this function deliberately does not
 * tell apart (the caller does, from the day's own last reading — see
 * `readingHasExchange` on it): the day had a real exchange from its very
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
  readings: ReadonlyArray<{ readAt: string; exchange: number | null }>
): string | null {
  let sawPlaceholder = false;
  for (const reading of readings) {
    if (readingHasExchange(reading.exchange)) {
      if (sawPlaceholder) return reading.readAt;
    } else {
      sawPlaceholder = true;
    }
  }
  return null;
}
