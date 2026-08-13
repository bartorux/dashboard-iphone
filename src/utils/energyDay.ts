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

/*
 * "Dziś" is gone from the sentence: the card puts the date above it, and saying
 * it twice in three lines is the same repetition we spent two days taking out of
 * the model's own writing.
 *
 * The genitive, because that is the case Polish reserves for good wishes —
 * "Wesołych Świąt", "Sto lat". In the indicative the same words read as a
 * description of the grid; in the genitive they read as a greeting, which is
 * what this is.
 *
 * "Zapas mocy" rather than "margines" on purpose. Margines is this app's own
 * word, and inside a greeting it sounds like the tool talking about itself.
 * Zapas mocy belongs to the trade instead, and carries a second reading: spare
 * capacity in the system, spare strength in the person. That second layer is
 * what makes it a wish rather than a parameter.
 *
 * A dull evening is the trade's own idea of a good one: of 92 alarm hours
 * measured across the fixtures, 73 fall between 17:00 and 23:00, so wishing the
 * evening boring wishes away the part of the day that is actually hard.
 */
export const ENERGY_DAY_GREETING =
  'Dzień Energetyka. Zapasu mocy i nudnych wieczorów.';

/**
 * What the day is, in one line.
 *
 * The holiday follows the patron of Polish electrical workers and therefore the
 * day he died — which is no thing to put on a card wishing people well, so it is
 * not here. Nor is the anecdote about the date moving from 1 September: true and
 * mildly interesting, but the card is for greeting, not for explaining, and a
 * line saved is a line the eye does not have to spend.
 */
export const ENERGY_DAY_ORIGIN =
  'Święto branży energetycznej, obchodzone 14 sierpnia od 1991 roku.';

/** Uses the local calendar, because a holiday is a local date, not an instant. */
export function isEnergyDay(when: Date): boolean {
  return when.getMonth() + 1 === MONTH && when.getDate() === DAY;
}
