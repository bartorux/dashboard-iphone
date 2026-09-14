/**
 * Contract between the generator (scripts/summary.ts writes public/ceny.json)
 * and the price strip under the reserve chart (src/components/chart/PriceStrip.tsx
 * reads it through src/hooks/usePrices.ts).
 *
 * Day-ahead electricity prices from pradcast.pl, which serves two different
 * things under one endpoint: the confirmed TGE fixing for days the day-ahead
 * market has already cleared, and its own model's forecast for the days after.
 * The owner's one hard requirement for the chart was that a prediction must
 * never look like a certainty, so the distinction is carried here as data —
 * `source` — and never inferred later from whether a band happens to exist.
 *
 * Why a forecast is drawn as a band and not a line: on 14.09.2026 the confirmed
 * price for 15.09 at 19:00 was 2 242 zł/MWh, while the model's central estimate
 * for a similar evening two days out was 1 240 with a 10–90 % band of 695–2 603.
 * The central line would have suggested a calm evening at exactly the hour a
 * reader looks. `price` on a forecast hour is kept for the tooltip, not the plot.
 */

/** Confirmed = TGE fixing (pradcast `tge_fixing1`); forecast = pradcast's model (`forecast_model`). */
export type PriceSource = 'confirmed' | 'forecast';

export interface PriceHour {
  /** Hour the block STARTS, 0–23, local Europe/Warsaw time, as pradcast reports it. */
  hour: number;
  /**
   * zł/MWh. For a confirmed hour: the settled price. For a forecast hour: the
   * model's central estimate — shown in the tooltip, never drawn as a line.
   */
  price: number;
  /** 10th percentile of the forecast, zł/MWh. `null` on confirmed hours. */
  p10: number | null;
  /** 90th percentile of the forecast, zł/MWh. `null` on confirmed hours. */
  p90: number | null;
}

export interface PriceDay {
  /** Business date, "YYYY-MM-DD". */
  date: string;
  source: PriceSource;
  /** How far ahead the forecast was made. `null` on confirmed days. */
  horizon: 'D+1' | 'D+2' | 'D+3' | null;
  /** The model's own day-level confidence. `null` on confirmed days. */
  confidence: 'high' | 'medium' | 'low' | null;
  /**
   * Hours in order. 24 on an ordinary day; 23 or 25 on a DST change day, as
   * pradcast reports them — the reader of this file decides how to place them.
   */
  hours: PriceHour[];
}

export interface PricesFile {
  /**
   * When the price DATA last changed — not when it was last fetched. The
   * generator polls several times a day, and a fetch that returns the same
   * numbers must leave this file byte-identical, or every quiet poll would
   * rebuild the site and churn the service worker on every phone.
   */
  changedAt: string;
  /** Attribution, shown under the strip. */
  source: 'pradcast.pl';
  /** Today up to D+3, only the days pradcast actually returned. May be empty. */
  days: PriceDay[];
}

/**
 * One archived confirmed day, one JSONL line in data/ceny-archiwum/YYYY-MM.jsonl:
 * [businessDate, [24 hourly prices in zł/MWh, index = hour], archivedAt ISO].
 *
 * Only confirmed days are archived. pradcast keeps hourly history for about a
 * week and daily aggregates beyond that, so the evening price of a day older
 * than that is gone unless it was written down here while it was still served.
 * The research page will read the evening peak from this archive once enough
 * days have accumulated for a rank to mean anything.
 */
export type PriceArchiveRow = readonly [businessDate: string, hourly: readonly number[], archivedAt: string];
