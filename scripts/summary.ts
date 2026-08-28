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
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HISTORY_FIELDS_WITH_MIX,
  fetchCompass,
  fetchPSEData,
  fetchPSEHistory,
} from '../src/utils/api';
import { processData } from '../src/utils/dataTransform';
import { visibleBusinessDates } from '../src/utils/dayWindow';
import {
  EMPTY_LOG,
  appendEntry,
  crossingsFor,
  describeMovement,
  describeSettling,
  movementFor,
  parseLog,
  snapshotDays,
} from '../src/utils/forecastLog';
import {
  EMPTY_LOG as EMPTY_TEXT_LOG,
  appendAttempt,
  parseLog as parseTextLog,
} from '../src/utils/summaryLog';
import type { PSEDataPoint } from '../src/types';
import {
  allowedHoursFor,
  assessmentKey,
  buildFacts,
  renderFacts,
} from '../src/utils/summaryFacts';
import type { ForecastNote } from '../src/utils/summaryFacts';
import { parseCompass } from '../src/utils/compass';
import type { CompassHour } from '../src/utils/compass';
import {
  archivePartition,
  newArchiveLines,
  parseArchiveLines,
  previousPartition,
} from '../src/utils/pk5lArchive';
import type { PSERawItem } from '../src/types';
import {
  PROMPT_VERSION,
  buildPrompt,
  parseSummary,
  validateSummary,
} from '../src/utils/summaryText';
import { dayMonth } from '../src/utils/dateHelpers';
import { askWithRetry, decideRun } from '../src/utils/summaryRun';
import type { Proba } from '../src/utils/summaryRun';
import type { Summary } from '../src/utils/summaryText';

const HISTORY_DAYS = 30;
const MODEL = 'gemini-3.5-flash-lite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/summary.json');
const logTarget = resolve(root, 'data/forecast-log.json');
const textLogTarget = resolve(root, 'data/summary-log.json');
const archiveDir = resolve(root, 'data/pk5l-archiwum');

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

/**
 * Appends what the forecast says right now, unless it repeats the last entry.
 *
 * Lives outside `public/` on purpose: nothing here is served to a browser, so
 * phones never download it and the publish step stays keyed on summary.json
 * alone — a quiet hour must not churn the service worker.
 */
function recordForecast(points: PSEDataPoint[], at: Date): void {
  let stored = EMPTY_LOG;
  try {
    stored = parseLog(JSON.parse(readFileSync(logTarget, 'utf8')));
  } catch {
    // No log yet, or an unreadable one. Either way this run starts a fresh
    // series rather than failing: the summary is the product, this is a record.
  }

  const entry = {
    at: at.toISOString(),
    days: snapshotDays(points, visibleBusinessDates(at)),
  };

  const next = appendEntry(stored, entry);
  if (next === stored) {
    console.log('Prognoza bez zmian wobec ostatniego wpisu — logu nie ruszam.');
    return;
  }

  mkdirSync(dirname(logTarget), { recursive: true });
  writeFileSync(logTarget, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Zapisano migawke prognozy — wpisow w logu: ${next.entries.length}.`);
}

/**
 * Appends this run's raw pk5l-wp readings to the monthly JSONL archive —
 * append-only, and on purpose the opposite cost shape of the logs above:
 * those rewrite a whole file every hour because they hold aggregates that
 * change; this one only ever grows, because every line is a fact about a
 * specific past moment that no later run can revise.
 *
 * pk5l-wp itself does not version — PSE was found to revise the same
 * (business_date, hour) block by thousands of megawatts with no trace left
 * of the earlier figure — so this is the only place the tool's own history
 * of what it actually said is kept, and the only way months from now to
 * measure its real hit rate against what happened.
 *
 * On RAW rows, before `processData` folds them into chart points, and read
 * from BOTH this partition and the previous one: near the start of a month a
 * business date up to ~5 days out can already have snapshots filed under last
 * month's partition, and without them a value that has not actually changed
 * would be re-archived as if it had.
 *
 * Wrapped whole, like `recordForecast`: a failure here is a lost data point,
 * never a reason to end the run that writes the actual product.
 */
function archivePk5l(rows: PSERawItem[], at: Date): void {
  try {
    const partition = archivePartition(at);
    const partitionPath = resolve(archiveDir, `${partition}.jsonl`);
    const previousPath = resolve(archiveDir, `${previousPartition(partition)}.jsonl`);

    const readPartition = (path: string): string => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return '';
      }
    };

    // Current partition spread last, so its entries win any duplicate key —
    // they are always the more recent of the two on a boundary.
    const lastByKey = new Map([
      ...parseArchiveLines(readPartition(previousPath)),
      ...parseArchiveLines(readPartition(partitionPath)),
    ]);

    const lines = newArchiveLines(rows, lastByKey, at.toISOString());
    if (lines.length === 0) {
      console.log('Archiwum pk5l-wp: bez zmian wobec ostatnich odczytow — nic nie dopisuje.');
      return;
    }

    mkdirSync(archiveDir, { recursive: true });
    appendFileSync(partitionPath, `${lines.join('\n')}\n`);
    console.log(`Archiwum pk5l-wp: dopisano ${lines.length} wierszy do ${partition}.jsonl.`);
  } catch (error) {
    console.warn(`Archiwum pk5l-wp pominiete w tym przebiegu: ${String(error)}`);
  }
}

const [forecast, history] = await Promise.all([
  fetchPSEData(),
  // With the mix, so the facts can say WHY an hour is tight. Only this job asks
  // for the wider rows; the browser keeps the narrow ones.
  fetchPSEHistory(HISTORY_DAYS, HISTORY_FIELDS_WITH_MIX),
]);

const now = new Date();
const points = processData(forecast);

/*
 * Recorded before anything else can end this run.
 *
 * Deliberately above the `facts.length === 0` exit and above the decideRun gate:
 * the log has to be written every hour whether or not the model is called, or it
 * grows holes exactly where nothing seemed to be happening — and "nothing was
 * happening" is a claim the log is supposed to be able to settle.
 */
if (!dryRun) recordForecast(points, now);

// Same moment, same reason: grows every hour whether or not the model is
// asked anything, and `dryRun` means "show me the prompt", not "read PSE
// live and pretend the run never happened".
if (!dryRun) archivePk5l(forecast, now);

/*
 * What the log says about each day, read back from the file this job has been
 * writing. Empty on the first runs, and empty forever in the browser — nothing
 * there has the file, and nothing there needs it.
 *
 * A day that has NOT SETTLED wins over the direction it is drifting, and that
 * ordering is the point rather than a preference. Drift is a median of windows,
 * so on a day crossing back and forth it reports a calm slide: on 16 August the
 * forecast for the next day went from -1935 MW to +406 MW between 10:55 and
 * 11:53, and "prognoza pogarsza się" would have been the reassuring falsehood.
 * Where the answer itself keeps changing, that is the thing worth saying.
 */
const ruch = new Map<string, ForecastNote>();
try {
  const zapisane = parseLog(JSON.parse(readFileSync(logTarget, 'utf8')));
  for (const businessDate of visibleBusinessDates(now)) {
    const nieustalona = describeSettling(crossingsFor(zapisane, businessDate));
    if (nieustalona) {
      ruch.set(businessDate, { text: nieustalona, unsettled: true });
      continue;
    }

    const dryf = describeMovement(movementFor(zapisane, businessDate));
    if (dryf) ruch.set(businessDate, { text: dryf, unsettled: false });
  }
} catch {
  // No log yet, or an unreadable one. The summary is the product; this is
  // context, and context missing must never end the run.
}

/*
 * PSE's own signal to consumers, fetched here and nowhere else.
 *
 * Asked for across the whole visible window even though only today and — from
 * about 16:35 — tomorrow are ever published. The absent days come back as no
 * rows, which is the endpoint's normal state rather than a fault, so there is
 * nothing to special-case and no date arithmetic to keep in step with the tabs.
 *
 * Wrapped like the forecast log above, and for the same reason: the summary is
 * the product, this is context, and context missing must never end the run. A
 * second guard on top of `fetchCompass` already mapping every failure to an
 * empty list — this endpoint is new to the job, and a throw from anywhere
 * inside the parse would otherwise take the whole hourly run down with it.
 */
const kompas = new Map<string, CompassHour[]>();
try {
  const dni = visibleBusinessDates(now);
  const surowe = await fetchCompass(dni[0], dni[dni.length - 1]);
  for (const hour of parseCompass(surowe)) {
    const bucket = kompas.get(hour.businessDate);
    if (bucket) bucket.push(hour);
    else kompas.set(hour.businessDate, [hour]);
  }
} catch {
  // No compass this run. The card simply says nothing about it, which is what
  // it says on the great majority of days anyway.
}

const facts = buildFacts(
  points,
  processData(history),
  now,
  visibleBusinessDates(now),
  ruch,
  kompas
);

if (facts.length === 0) {
  console.log('Brak godzin przed nami — zostawiam poprzednie podsumowanie.');
  process.exit(0);
}

// The prompt version rides along, so correcting how we say things forces one
// rewrite instead of waiting for the grid to move.
const key = `${assessmentKey(facts)}#v${PROMPT_VERSION}`;
const existing = readExisting();

if (dryRun) {
  console.log(buildPrompt(facts, HISTORY_DAYS, now));
  console.log('\n---- ocena ----');
  console.log(key);
  process.exit(0);
}

const decyzja = decideRun({
  storedAssessment: existing?.assessment ?? null,
  storedAt: existing ? new Date(existing.generatedAt) : null,
  key,
  now,
});

console.log(decyzja.reason);
if (!decyzja.generate) process.exit(0);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Brak GEMINI_API_KEY — zostawiam poprzednie podsumowanie.');
  process.exit(existing ? 0 : 1);
}

/**
 * Keeps whatever is already on disk and ends the run without failing it.
 *
 * Raised as a workflow warning, not just a log line. From the outside a refused
 * answer looked exactly like an unchanged assessment — both end with the deploy
 * job skipped — so a validator rejecting every single run was indistinguishable
 * from a quiet hour, and the published text sat frozen with nothing to show why.
 */
/**
 * Files away what the model said, accepted or not.
 *
 * The refused ones are the point. A rejection leaves nothing behind but a
 * warning naming the rule, so the one that fired today told us which check
 * caught it and nothing about how close the text had been — and "what was weak"
 * is only answerable by reading a day of them side by side.
 */
function recordAttempt(
  answer: { headline: string; body: string; outlook: string },
  accepted: boolean,
  reason?: string
): void {
  let stored = EMPTY_TEXT_LOG;
  try {
    stored = parseTextLog(JSON.parse(readFileSync(textLogTarget, 'utf8')));
  } catch {
    // First run, or an unreadable notebook. Neither may end the job.
  }

  const next = appendAttempt(stored, {
    at: now.toISOString(),
    prompt: PROMPT_VERSION,
    accepted,
    ...(reason ? { reason } : {}),
    headline: answer.headline,
    body: answer.body,
    outlook: answer.outlook,
  });

  mkdirSync(dirname(textLogTarget), { recursive: true });
  writeFileSync(textLogTarget, `${JSON.stringify(next, null, 2)}\n`);
}

function giveUp(reason: string): never {
  console.error(`${reason} — zostawiam poprzednie podsumowanie.`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning title=Podsumowanie nieodświeżone::${reason}`);
  }
  process.exit(0);
}

// Every clock time the facts state, the Kompas ranges included. Moved into
// summaryFacts so a new kind of hour cannot reach the prompt without also
// reaching the validator — the deadlock that costs an hour of stale card.
const allowedHours = allowedHoursFor(facts);

// The spoken name AND the plain date of every visible day. A day the facts
// contain is never an invented number, however we choose to speak of it.
const allowedDayNames = facts
  .flatMap((day) => [day.spokenName, dayMonth(day.businessDate)])
  .filter(Boolean);

const prompt = buildPrompt(facts, HISTORY_DAYS, now);

// Narrowed once, here: inside `ask` the guard above no longer applies and the
// key is `string | undefined` again — which the browser-only typecheck could
// not have told us, because it never looked at this file.
const klucz: string = apiKey;

/** Reported at the end of a successful run, so the quota stays visible. */
let tokenow: number | undefined;

/**
 * One ask. Network and HTTP failures still end the job on the spot: those are
 * an outage or a rate limit, and asking again straight away neither fixes the
 * first nor is allowed by the second.
 */
async function ask(): Promise<string | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': klucz },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          // Raised from 0.2 for the sake of variety: the verdict rarely moves,
          // so at the old setting an hourly rewrite produced the same paragraph
          // and the card stopped being read. The facts are fixed and validation
          // still refuses any figure, so what varies is wording, never substance.
          // It is also what makes a second ask worth anything at all.
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

  tokenow = payload.usageMetadata?.totalTokenCount;
  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

function judge(text: string): Proba<Summary> {
  const parsed = parseSummary(text);
  if (!parsed) {
    // Kept raw: an answer that did not parse is exactly the kind we cannot
    // reconstruct later, and its shape is the whole diagnosis.
    return {
      ok: false,
      summary: null,
      reason: 'odpowiedz nie ma oczekiwanych pol',
      raw: text.slice(0, 400),
    };
  }

  const verdict = validateSummary(parsed, allowedHours, allowedDayNames);
  return verdict.ok
    ? { ok: true, summary: parsed }
    : { ok: false, summary: parsed, reason: verdict.reason };
}

const wynik = await askWithRetry<Summary>(
  ask,
  judge,
  (proba) =>
    recordAttempt(
      proba.summary ?? { headline: proba.raw ?? '', body: '', outlook: '' },
      proba.ok,
      proba.ok ? undefined : proba.reason
    )
);

if (!wynik.ok || !wynik.summary) giveUp(`Odrzucone: ${wynik.reason}`);
const summary = wynik.summary;

const file: SummaryFile = {
  ...summary,
  generatedAt: now.toISOString(),
  dates: facts.map((day) => day.businessDate),
  assessment: key,
  model: MODEL,
};

writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

console.log('Zapisano public/summary.json');
console.log(`tokenow: ${tokenow ?? '?'}`);
console.log(renderFacts(facts, HISTORY_DAYS));
console.log('----');
console.log(summary.headline);
console.log(summary.body);
console.log(summary.outlook);
