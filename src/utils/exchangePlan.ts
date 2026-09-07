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
 * (seen at 13:19 on 06.09 and 13:59 on 01.09): a jump of 2–3 GW in one write.
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
