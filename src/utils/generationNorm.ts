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

/**
 * Worth a word at all. Below this a driver is not what made the hour tight — the
 * margins in question are measured in thousands.
 */
export const NOTABLE_MW = 300;

/**
 * Worth a stronger word. Anchored on 1100 MW, the surplus at which the operator
 * stops being allowed to refrain from declaring: a driver off by about that much
 * is off by enough to change what the regulation permits.
 */
export const STRONG_MW = 1000;

export interface HourNorm {
  hourLabel: string;
  /** Median for the same hour across the history window. */
  medians: Record<DriverName, number | null>;
  samples: number;
}

/**
 * Median mix per hour of the day, built the same way the margin band is.
 *
 * Median rather than mean: a single windy day would drag an average enough to
 * make an ordinary evening look calm.
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

    const medians = {} as Record<DriverName, number | null>;
    for (const driver of DRIVERS) {
      const values = points
        .map((point) => valueOf(point, driver))
        .filter((value): value is number => value !== null && Number.isFinite(value))
        .sort((a, b) => a - b);

      medians[driver] =
        values.length >= minSamples ? percentile(values, 0.5) : null;
    }

    norms.set(hourLabel, { hourLabel, medians, samples: points.length });
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
}

export function explainHour(
  point: PSEDataPoint,
  norm: HourNorm | undefined,
  notable = NOTABLE_MW
): HourExplanation {
  const empty: HourExplanation = { worse: [], better: null, demandTypical: false };
  if (!norm) return empty;

  const drivers: Driver[] = [];
  let demandTypical = false;

  for (const name of DRIVERS) {
    const actual = valueOf(point, name);
    const median = norm.medians[name];
    if (actual === null || median === null) continue;

    const delta = actual - median;
    const impact = HELPS_WHEN_HIGHER[name] ? -delta : delta;

    if (Math.abs(delta) < notable) {
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
  };
}

function wordFor(driver: Driver): string {
  const direction = driver.delta > 0 ? 'powyżej normy' : 'poniżej normy';
  const strength = Math.abs(driver.delta) >= STRONG_MW ? 'wyraźnie ' : '';
  return `${driver.name} ${strength}${direction}`;
}

/**
 * The finished clause, or null when nothing stands out.
 *
 * Null rather than "wszystko typowe": a line saying nothing is a line the model
 * will find a way to repeat.
 */
export function describeDrivers(explanation: HourExplanation): string | null {
  if (explanation.worse.length === 0) return null;

  /*
   * One counterweight, never two.
   *
   * Handed "wiatr poniżej normy, zapotrzebowanie typowe; w drugą stronę ubytki
   * poniżej normy" the model wrote it back almost verbatim, three factors in a
   * row: "O 20:00 wiatr spada poniżej normy przy typowym zapotrzebowaniu
   * i ubytkach poniżej normy." Correct, and it reads like a machine — because a
   * comma-separated list is what it was given.
   *
   * A measured counterweight beats "demand is ordinary": it names something that
   * actually moved, so the clause becomes a contrast rather than an inventory.
   * Ordinary demand is still worth saying when nothing else is holding the
   * margin up, since then it is the whole of the good news.
   */
  const counterweight = explanation.better
    ? `w drugą stronę ${wordFor(explanation.better)}`
    : explanation.demandTypical
      ? 'zapotrzebowanie typowe'
      : null;

  const clause = explanation.worse.map(wordFor).join(', ');
  return counterweight ? `${clause}; ${counterweight}` : clause;
}
