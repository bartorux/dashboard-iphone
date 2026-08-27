/**
 * Prints the facts that would be sent to the language model, computed from live
 * PSE data. Kept separate from the generator so the input can be inspected on
 * its own, without a key and without spending quota.
 *
 *   npx tsx scripts/facts.ts
 *
 * Not `node --experimental-strip-types`: Node strips the types happily enough
 * but cannot resolve the bundler-style directory imports these modules use, and
 * fails with ERR_UNSUPPORTED_DIR_IMPORT before running a line.
 */
import { fetchCompass, fetchPSEData, fetchPSEHistory } from '../src/utils/api';
import { processData } from '../src/utils/dataTransform';
import { parseCompass } from '../src/utils/compass';
import type { CompassHour } from '../src/utils/compass';
import { visibleBusinessDates } from '../src/utils/dayWindow';
import { allowedHoursFor, buildFacts, renderFacts } from '../src/utils/summaryFacts';

const HISTORY_DAYS = 30;

const now = new Date();
const dni = visibleBusinessDates(now);

const [forecast, history, compassRaw] = await Promise.all([
  fetchPSEData(),
  fetchPSEHistory(HISTORY_DAYS),
  // Wrapped like the scheduled job wraps it: this script exists to show the
  // facts, and a second endpoint failing must leave the first eight still
  // printable rather than ending the run with a stack trace.
  fetchCompass(dni[0], dni[dni.length - 1]).catch(() => []),
]);

const kompas = new Map<string, CompassHour[]>();
for (const hour of parseCompass(compassRaw)) {
  const bucket = kompas.get(hour.businessDate);
  if (bucket) bucket.push(hour);
  else kompas.set(hour.businessDate, [hour]);
}

const facts = buildFacts(
  processData(forecast),
  processData(history),
  now,
  dni,
  new Map(),
  kompas
);
const text = renderFacts(facts, HISTORY_DAYS);

console.log(`teraz: ${now.toISOString()}`);
console.log(`punktow prognozy: ${forecast.length}, historii: ${history.length}`);
console.log(
  `godzin Kompasu: ${compassRaw.length}, dob z flaga: ` +
    `${facts.filter((day) => day.compass.length > 0).length}`
);
console.log('---- tresc wysylana do modelu ----');
console.log(text);
console.log('---- koniec ----');
console.log(`znakow: ${text.length}`);
console.log(`dozwolone godziny: ${[...allowedHoursFor(facts)].sort().join(', ')}`);
