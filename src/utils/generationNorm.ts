import type { PSEDataPoint } from '../types';
import { percentile } from './history';

/**
 * Why an hour is tight, answered from the generation mix.
 *
 * The card could always say a margin was narrow; it could never say what made it
 * narrow, because the facts sent to the model carried no generation figure at
 * all — not wind, not PV, not demand — even though every one of them is fetched
 * and drawn on the chart directly below. The model was asked to be interesting
 * about a verdict and a number, which is not enough material to be interesting
 * about.
 *
 * Measured on 12 August, 20:00: wind 653 MW against a usual 1448, outages 2995
 * against 2272, and demand 19 063 against 19 078 — dead normal. The useful
 * sentence is the one naming what it is NOT: the evening is tight because of
 * wind and outages, not because anyone is drawing more power than usual.
 *
 * As everywhere else here, the conclusion is reached in code and the model only
 * puts it into a sentence.
 */

export type DriverName = 'wiatr' | 'PV' | 'zapotrzebowanie' | 'ubytki';

const DRIVERS: DriverName[] = ['wiatr', 'PV', 'zapotrzebowanie', 'ubytki'];

/**
 * Which way a driver pushes the margin when it rises.
 *
 * Wind and PV add to what is available; demand and outages take from it. Without
 * this the ranking would treat a windless evening and a quiet evening as the
 * same kind of event.
 */
const HELPS_WHEN_HIGHER: Record<DriverName, boolean> = {
  wiatr: true,
  PV: true,
  zapotrzebowanie: false,
  ubytki: false,
};

function valueOf(point: PSEDataPoint, driver: DriverName): number | null {
  switch (driver) {
    case 'wiatr':
      return point.wind;
    case 'PV':
      return point.pv;
    case 'zapotrzebowanie':
      return point.demand;
    case 'ubytki':
      return point.outages;
  }
}

/** Median plus the band a driver usually stays inside, for one hour of the day. */
export interface DriverBand {
  p10: number;
  p50: number;
  p90: number;
}

export interface HourNorm {
  hourLabel: string;
  bands: Record<DriverName, DriverBand | null>;
  samples: number;
}

/**
 * What each driver usually does at this hour, as a band rather than a point.
 *
 * A single figure was not enough, and the fixed 300 MW threshold that went with
 * it was the mistake. These quantities do not vary on remotely the same scale:
 * measured over 22 working days at 20:00, demand runs 18 785–20 046 MW — a
 * 10th-to-90th spread of 7% of its median — while wind runs 475–2 548, a spread
 * of 134%. Three hundred megawatts is a real event for demand and pure routine
 * for wind.
 *
 * The consequence was measurable: under the fixed threshold a driver was named
 * as "odbiegający" in 77% of hours, which is another way of saying the word
 * meant nothing. Against its own band it is 23%, and that 23% is by
 * construction the genuinely unusual part.
 *
 * Median rather than mean throughout: one windy day would drag an average far
 * enough to make an ordinary evening look calm.
 */
export function generationNorms(
  history: PSEDataPoint[],
  minSamples = 3
): Map<string, HourNorm> {
  const byHour = new Map<string, PSEDataPoint[]>();

  for (const point of history) {
    const bucket = byHour.get(point.hourLabel);
    if (bucket) bucket.push(point);
    else byHour.set(point.hourLabel, [point]);
  }

  const norms = new Map<string, HourNorm>();

  for (const [hourLabel, points] of byHour) {
    if (points.length < minSamples) continue;

    const bands = {} as Record<DriverName, DriverBand | null>;
    for (const driver of DRIVERS) {
      const values = points
        .map((point) => valueOf(point, driver))
        .filter((value): value is number => value !== null && Number.isFinite(value))
        .sort((a, b) => a - b);

      bands[driver] =
        values.length >= minSamples
          ? {
              p10: percentile(values, 0.1),
              p50: percentile(values, 0.5),
              p90: percentile(values, 0.9),
            }
          : null;
    }

    norms.set(hourLabel, { hourLabel, bands, samples: points.length });
  }

  return norms;
}

export interface Driver {
  name: DriverName;
  /** Signed difference from the usual value for this hour, in MW. */
  delta: number;
  /** How much of that difference makes the margin worse. Positive is worse. */
  impact: number;
}

export interface HourExplanation {
  /** Drivers pushing the margin down, heaviest first. At most two. */
  worse: Driver[];
  /**
   * The single driver holding the margin up, when one stands out.
   *
   * Without it the explanation is half an answer. Measured on Thursday 13 August
   * at 20:00: wind 766 MW below its usual, which is why that hour is the week's
   * tightest — but outages 845 MW below theirs, which is why it is still
   * comfortable. Reporting only the first would describe a worrying evening; the
   * pair describes the real one.
   */
  better: Driver | null;
  /**
   * Demand sitting at its usual level.
   *
   * Tracked separately because it carries the most useful half of the sentence:
   * that the hour is not tight because of consumption. A reader who knows the
   * evening peak is ordinary knows to look at the weather instead.
   */
  demandTypical: boolean;
  /**
   * The norm was known and nothing left its own band.
   *
   * Distinct from "no norm at all", which is silence for want of data. This is a
   * finding: the hour is the tightest of the week and yet nothing unusual is
   * behind it — just the ordinary evening peak. Said plainly it is worth as much
   * as naming a culprit, and it is true far more often.
   */
  nothingStandsOut: boolean;
}

export function explainHour(
  point: PSEDataPoint,
  norm: HourNorm | undefined
): HourExplanation {
  const empty: HourExplanation = {
    worse: [],
    better: null,
    demandTypical: false,
    nothingStandsOut: false,
  };
  if (!norm) return empty;

  const drivers: Driver[] = [];
  let demandTypical = false;
  let known = 0;

  for (const name of DRIVERS) {
    const actual = valueOf(point, name);
    const band = norm.bands[name];
    if (actual === null || band === null) continue;

    known += 1;
    const delta = actual - band.p50;
    const impact = HELPS_WHEN_HIGHER[name] ? -delta : delta;

    /*
     * Measured against the driver's OWN band, not a fixed number of megawatts.
     * The threshold that used to sit here treated a windless evening and an
     * unusually heavy load as the same size of event, and named one or the other
     * in 77% of hours — which left the word "odbiegający" meaning nothing.
     */
    if (actual >= band.p10 && actual <= band.p90) {
      if (name === 'zapotrzebowanie') demandTypical = true;
      continue;
    }

    drivers.push({ name, delta, impact });
  }

  // Ranked by how much each one moves the margin, and hard-capped: two pushing
  // down, one holding up. Handing the model all four invites the list back — the
  // same failure that made it recite one hour per day when every day carried one.
  const worse = drivers
    .filter((driver) => driver.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2);

  const helping = drivers
    .filter((driver) => driver.impact < 0)
    .sort((a, b) => a.impact - b.impact);

  return {
    worse,
    // Only worth saying alongside something it works against. On its own it
    // would explain why a comfortable hour is comfortable, which is filler.
    better: worse.length > 0 ? (helping[0] ?? null) : null,
    demandTypical,
    nothingStandsOut: known > 0 && drivers.length === 0,
  };
}

/**
 * No second grade of unusual.
 *
 * "Wyraźnie" used to be added past a fixed 1000 MW, which is the same mistake as
 * the threshold it accompanied: against demand's narrow band almost everything
 * outside it clears 1000 MW, and against wind's wide one almost nothing does. So
 * the word fired constantly for one driver and never for another, which is not
 * what it meant to say.
 *
 * Twenty-two samples cannot support a second, rarer cut either. Leaving the band
 * to speak for itself: outside it is unusual, inside it is not, and that is the
 * whole of what the data can carry.
 */
function wordFor(driver: Driver): string {
  return `${driver.name} ${driver.delta > 0 ? 'powyżej normy' : 'poniżej normy'}`;
}

/**
 * The finished clause, or null when nothing stands out.
 *
 * Null rather than "wszystko typowe": a line saying nothing is a line the model
 * will find a way to repeat.
 */
export function describeDrivers(
  explanation: HourExplanation,
  /**
   * Whether the clause may carry what is holding the margin up.
   *
   * Off on a day with no grounds, where the 30-day standing beside it already
   * plays that part: two reassurances against one worry turned the sentence into
   * a see-saw — "najciaśniej… ale ubytki nisko… ale i tak typowo" — balanced to
   * the point of saying nothing. Where the regulation does have something to
   * say, the trade-off is the substance and stays.
   */
  includeCounterweight = true
): string | null {
  /*
   * "Nothing stands out" is an answer, not a shrug.
   *
   * Against each driver's own band the mix is unremarkable about three quarters
   * of the time, so a line that only ever spoke about culprits would fall silent
   * on most days — and the card would go back to the terseness that started this
   * whole thread. That an hour is the tightest of the week WITHOUT anything
   * unusual behind it is worth a sentence: it means the ordinary evening peak,
   * nothing more.
   */
  if (explanation.nothingStandsOut) {
    return 'nic nie odstaje od normy dla tej pory — zwykły przebieg doby';
  }

  if (explanation.worse.length === 0) return null;

  const counterweight = !includeCounterweight
    ? null
    : explanation.better
      ? `w drugą stronę ${wordFor(explanation.better)}`
      : explanation.demandTypical
        ? 'zapotrzebowanie typowe'
        : null;

  const clause = explanation.worse.map(wordFor).join(', ');
  return counterweight ? `${clause}; ${counterweight}` : clause;
}

