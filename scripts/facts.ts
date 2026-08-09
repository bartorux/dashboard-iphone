/**
 * Prints the facts that would be sent to the language model, computed from live
 * PSE data. Kept separate from the generator so the input can be inspected on
 * its own, without a key and without spending quota.
 *
 *   node --experimental-strip-types scripts/facts.ts
 */
import { fetchPSEData, fetchPSEHistory } from '../src/utils/api';
import { processData } from '../src/utils/dataTransform';
import { buildFacts, renderFacts } from '../src/utils/summaryFacts';

const HISTORY_DAYS = 30;

const [forecast, history] = await Promise.all([
  fetchPSEData(),
  fetchPSEHistory(HISTORY_DAYS),
]);

const now = new Date();
const facts = buildFacts(processData(forecast), processData(history), now);
const text = renderFacts(facts, HISTORY_DAYS);

console.log(`teraz: ${now.toISOString()}`);
console.log(`punktow prognozy: ${forecast.length}, historii: ${history.length}`);
console.log('---- tresc wysylana do modelu ----');
console.log(text);
console.log('---- koniec ----');
console.log(`znakow: ${text.length}`);
