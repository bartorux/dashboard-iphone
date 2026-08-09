/**
 * Writes public/summary.json, which is the only thing the browser ever reads.
 *
 * Runs on a schedule, never on a visit: however many people open the dashboard,
 * the model is called no more often than this job runs.
 *
 *   GEMINI_API_KEY=... npx tsx scripts/summary.ts
 *   npx tsx scripts/summary.ts --dry-run    # facts and prompt only, no call
 *
 * Exits 0 whenever the existing file is still fit to serve. A failure here must
 * not replace a good summary with a bad one, nor fail a scheduled run for
 * something as ordinary as the model being briefly unavailable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPSEData, fetchPSEHistory } from '../src/utils/api';
import { processData } from '../src/utils/dataTransform';
import { assessmentKey, buildFacts, renderFacts } from '../src/utils/summaryFacts';
import { buildPrompt, parseSummary, validateSummary } from '../src/utils/summaryText';
import type { Summary } from '../src/utils/summaryText';

const HISTORY_DAYS = 30;
const MODEL = 'gemini-3.5-flash-lite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/summary.json');

interface SummaryFile extends Summary {
  /** When the text was written, so the card can show its age. */
  generatedAt: string;
  /**
   * Business dates the text covers — stored as dates, never as a finished
   * phrase. A summary written at 23:50 and read after midnight would carry a
   * label calling a day "today" that had since become yesterday.
   */
  dates: string[];
  /** What it describes — a rewrite is pointless while this is unchanged. */
  assessment: string;
  model: string;
}

const dryRun = process.argv.includes('--dry-run');

function readExisting(): SummaryFile | null {
  try {
    return JSON.parse(readFileSync(target, 'utf8')) as SummaryFile;
  } catch {
    return null;
  }
}

const [forecast, history] = await Promise.all([
  fetchPSEData(),
  fetchPSEHistory(HISTORY_DAYS),
]);

const now = new Date();
const facts = buildFacts(processData(forecast), processData(history), now);

if (facts.length === 0) {
  console.log('Brak godzin przed nami — zostawiam poprzednie podsumowanie.');
  process.exit(0);
}

const key = assessmentKey(facts);
const existing = readExisting();

if (dryRun) {
  console.log(buildPrompt(facts, HISTORY_DAYS, now));
  console.log('\n---- ocena ----');
  console.log(key);
  process.exit(0);
}

if (existing?.assessment === key) {
  console.log('Ocena bez zmian — nie wolam modelu.');
  process.exit(0);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Brak GEMINI_API_KEY — zostawiam poprzednie podsumowanie.');
  process.exit(existing ? 0 : 1);
}

/** Keeps whatever is already on disk and ends the run without failing it. */
function giveUp(reason: string): never {
  console.error(`${reason} — zostawiam poprzednie podsumowanie.`);
  process.exit(0);
}

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(facts, HISTORY_DAYS, now) }] }],
      generationConfig: {
        // Raised from 0.2 for the sake of variety: the verdict rarely moves,
        // so at the old setting an hourly rewrite produced the same paragraph
        // and the card stopped being read. The facts are fixed and validation
        // still refuses any figure, so what varies is wording, never substance.
        temperature: 0.7,
        maxOutputTokens: 800,
        // Already minimal by default on this model, and set explicitly because
        // raising it measured three times the tokens and truncated the answer:
        // the reasoning is done in code, so there is nothing here to think about.
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    }),
  }
).catch((error: unknown) => {
  giveUp(`Blad sieci: ${String(error)}`);
});

if (!response.ok) {
  giveUp(`Model odpowiedzial HTTP ${response.status}`);
}

const payload = (await response.json()) as {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { totalTokenCount?: number };
};

const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) giveUp('Model nie zwrocil tekstu');

const summary = parseSummary(text);
if (!summary) giveUp('Odpowiedz nie ma trzech oczekiwanych pol');

const allowedHours = new Set<string>();
for (const day of facts) {
  if (day.worstHour) allowedHours.add(day.worstHour);
  for (const range of day.ranges) {
    allowedHours.add(range.from);
    allowedHours.add(range.to);
  }
}

const verdict = validateSummary(summary, allowedHours);
if (!verdict.ok) giveUp(`Odrzucone: ${verdict.reason}`);

const file: SummaryFile = {
  ...summary,
  generatedAt: now.toISOString(),
  dates: facts.map((day) => day.businessDate),
  assessment: key,
  model: MODEL,
};

writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

console.log('Zapisano public/summary.json');
console.log(`tokenow: ${payload.usageMetadata?.totalTokenCount ?? '?'}`);
console.log(renderFacts(facts, HISTORY_DAYS));
console.log('----');
console.log(summary.headline);
console.log(summary.body);
console.log(summary.outlook);
