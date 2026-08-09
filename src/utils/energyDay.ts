/**
 * Dzień Energetyka — 14 August.
 *
 * The date follows the patron of Polish electrical workers, Maksymilian Kolbe,
 * an electrician by inclination, who died on 14 August 1941. The holiday moved
 * twice before settling here in 1991; it is not the first of September, which is
 * what it was until 1972.
 *
 * Rendered by the app rather than written by the model. It happens once a year,
 * and once a year is exactly when you do not want the wording to depend on what
 * a language model felt like producing that morning.
 */
const MONTH = 8;
const DAY = 14;

export const ENERGY_DAY_GREETING =
  'Dziś Dzień Energetyka. Wszystkiego dobrego dla tych, którzy trzymają system w ryzach.';

/** Uses the local calendar, because a holiday is a local date, not an instant. */
export function isEnergyDay(when: Date): boolean {
  return when.getMonth() + 1 === MONTH && when.getDate() === DAY;
}
