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
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORECAST_FIELDS,
  HISTORY_FIELDS_WITH_MIX,
  fetchCompass,
  fetchCompassHistory,
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
  countImplausibleBusinessDates,
  lastValuesFrom,
  newArchiveLines,
  previousPartition,
} from '../src/utils/pk5lArchive';
import {
  compassVersionRows,
  lastCompassValuesFrom,
  newCompassArchiveLines,
} from '../src/utils/kompasArchive';
import { buildBadanieWithObservations, parseArchiveRows } from '../src/utils/badanie';
import type { CallEvent, Observation } from '../src/utils/badanieTypes';
import { observationsFromIssues } from '../src/utils/obserwacje';
import type { IssueLike } from '../src/utils/obserwacje';
import type { PSERawItem, PSECompassRawItem } from '../src/types';
import { archiveLines, normalizeDay, pricesFile } from '../src/utils/ceny';
import type { PricesFile } from '../src/utils/cenyTypes';
import { readNewsFile } from '../src/utils/news';
import { collectNews } from './news';
import {
  PROMPT_VERSION,
  buildPrompt,
  parseSummary,
  validateSummary,
} from '../src/utils/summaryText';
import {
  addDays,
  dayMonth,
  formatDate,
  publicationTsToIso,
} from '../src/utils/dateHelpers';
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
const compassArchiveDir = resolve(root, 'data/kompas-archiwum');
const badanieTarget = resolve(root, 'data/badanie.json');
const eventsTarget = resolve(root, 'data/przywolania.json');
const pricesTarget = resolve(root, 'public/ceny.json');
const pricesArchiveDir = resolve(root, 'data/ceny-archiwum');
// Deliberately in data/, never in public/: the deploy gate is keyed on
// public/ceny.json changing (see summary.yml), and a read attempt on its own
// is not a change worth publishing — only recording it here keeps the rate
// limiter's own bookkeeping from ever touching the file a phone downloads.
const pricesLastFetchTarget = resolve(root, 'data/ceny-last-fetch.json');
const newsTarget = resolve(root, 'public/news.json');
// In data/ for the same reason as the prices marker above.
const newsLastFetchTarget = resolve(root, 'data/news-last-fetch.json');

/**
 * Read once at startup rather than per-request: `package.json` does not
 * change mid-run, and pradcast's own 403 on curl's default header (see the
 * function below) is exactly the failure a static, wrong string would repeat
 * on every one of the four daily requests instead of just being wrong once.
 */
const pkgVersion = (() => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return typeof pkg.version === 'string' ? pkg.version : 'dev';
  } catch {
    return 'dev';
  }
})();

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

    // Current partition last, so its entries win any duplicate key — they are
    // always the more recent of the two on a boundary. The fold lives in the
    // module (lastValuesFrom) so a test guards the previous-partition read.
    const lastByKey = lastValuesFrom([
      readPartition(previousPath),
      readPartition(partitionPath),
    ]);

    // Counted separately from the lines actually written: PSE's own feed
    // carries rows dated years ahead (measured 08.09.2026 — 200 rows for 2031,
    // which reached the archive through the unbounded fallback query), and a
    // silent filter would repeat the mistake that let them in.
    const nierealne = countImplausibleBusinessDates(rows, at.toISOString());
    if (nierealne > 0) {
      console.warn(`Archiwum pk5l-wp: pominieto ${nierealne} wierszy z niewiarygodna data doby.`);
    }

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

/**
 * Appends this run's raw pdgsz (Kompas Energetyczny) readings to the monthly
 * JSONL archive — the same shape and the same reason as `archivePk5l`: PSE
 * serves only the current `is_active` version through the endpoint this job
 * polls every hour, so without this the version that was live at any past
 * moment is lost the instant PSE republishes a period.
 */
function archiveCompass(rows: PSECompassRawItem[], at: Date): void {
  try {
    const partition = archivePartition(at);
    const partitionPath = resolve(compassArchiveDir, `${partition}.jsonl`);
    const previousPath = resolve(
      compassArchiveDir,
      `${previousPartition(partition)}.jsonl`
    );

    const readPartition = (path: string): string => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return '';
      }
    };

    const lastByKey = lastCompassValuesFrom([
      readPartition(previousPath),
      readPartition(partitionPath),
    ]);

    const lines = newCompassArchiveLines(rows, lastByKey, at.toISOString());
    if (lines.length === 0) {
      console.log('Archiwum Kompasu: bez zmian wobec ostatnich odczytow — nic nie dopisuje.');
      return;
    }

    mkdirSync(compassArchiveDir, { recursive: true });
    appendFileSync(partitionPath, `${lines.join('\n')}\n`);
    console.log(`Archiwum Kompasu: dopisano ${lines.length} wierszy do ${partition}.jsonl.`);
  } catch (error) {
    console.warn(`Archiwum Kompasu pominiete w tym przebiegu: ${String(error)}`);
  }
}

/** Once an hour, whatever the job's own cadence — see `writePrices`. */
const PRICES_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** How long one pradcast request may take before this day is given up on. */
const PRADCAST_TIMEOUT_MS = 10_000;

/**
 * curl's default `User-Agent` gets a 403 from pradcast; a project name does
 * not (checked live 14.09.2026). Built from `pkgVersion` so a release bump is
 * the only thing that ever changes it.
 */
const PRADCAST_USER_AGENT = `pse-dashboard/${pkgVersion} (+https://github.com/bartorux/dashboard-iphone)`;

function readExistingPrices(): PricesFile | null {
  try {
    const parsed = JSON.parse(readFileSync(pricesTarget, 'utf8')) as Partial<PricesFile>;
    return Array.isArray(parsed.days) ? (parsed as PricesFile) : null;
  } catch {
    return null;
  }
}

function readLastPricesFetch(): Date | null {
  try {
    const raw = JSON.parse(readFileSync(pricesLastFetchTarget, 'utf8')) as { at?: string };
    if (typeof raw.at !== 'string') return null;
    const parsed = new Date(raw.at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * One day's prices from pradcast, or `null` on anything short of a usable
 * answer — a timeout, a non-200, or a body `normalizeDay` does not trust.
 * Every failure is this ONE day's alone: the caller still gets whatever other
 * days succeeded, which is the whole point of asking day by day rather than
 * as one request pradcast does not actually offer.
 */
async function fetchPradcastDay(date: string, apiKey: string | undefined) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRADCAST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'User-Agent': PRADCAST_USER_AGENT };
    // Anonymous access works today (checked live 14.09.2026); the header is
    // added the moment the owner provisions PRADCAST_API_KEY, with nothing
    // here to change on that day.
    if (apiKey) headers['X-API-Key'] = apiKey;

    const response = await fetch(`https://api.pradcast.pl/prices/date/${date}`, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`Ceny pradcast: doba ${date} — HTTP ${response.status}.`);
      return null;
    }

    const day = normalizeDay(await response.json());
    if (!day) console.warn(`Ceny pradcast: doba ${date} odrzucona przy walidacji odpowiedzi.`);
    return day;
  } catch (error) {
    console.warn(`Ceny pradcast: doba ${date} pominieta — ${String(error)}.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Writes public/ceny.json (day-ahead prices from pradcast.pl) and appends
 * this run's confirmed days to data/ceny-archiwum/YYYY-MM.jsonl.
 *
 * Rate-limited to once an hour independently of the job's own cadence: the
 * browser never calls pradcast directly (no CORS for this origin, so the
 * generator is the only path), but a quarter-hourly job otherwise means a
 * quarter-hourly call, and pradcast's own price for a business date does not
 * move that often. The marker lives in data/, never in public/ceny.json
 * itself — see `pricesLastFetchTarget` — so a quiet poll cannot touch the one
 * file the deploy gate and the service worker both watch.
 *
 * Wrapped whole, like every archive above: a pradcast outage is a missing
 * strip under the reserve chart, never a reason to fail the run that writes
 * the actual product.
 */
async function writePrices(now: Date): Promise<void> {
  try {
    const existing = readExistingPrices();
    const hasData = existing !== null && existing.days.length > 0;
    const lastFetch = readLastPricesFetch();

    if (hasData && lastFetch && now.getTime() - lastFetch.getTime() < PRICES_MIN_INTERVAL_MS) {
      console.log('Ceny pradcast: ostatni odczyt mniej niz godzine temu — pomijam w tym przebiegu.');
      return;
    }

    // Recorded before the fetch even starts, and regardless of how it turns
    // out: the limiter above is about how often pradcast gets ASKED, not
    // about whether the answer was any good.
    mkdirSync(dirname(pricesLastFetchTarget), { recursive: true });
    writeFileSync(pricesLastFetchTarget, `${JSON.stringify({ at: now.toISOString() })}\n`);

    const apiKey = process.env.PRADCAST_API_KEY;
    // Calendar dates, not `visibleBusinessDates`: that helper skips weekends
    // because a call period is never declared on one, which has nothing to do
    // with whether a day-ahead PRICE exists for it. Today through D+3 is
    // exactly pradcast's own stated window (today and tomorrow confirmed,
    // D+2/D+3 forecast).
    const dates = [0, 1, 2, 3].map((offset) => formatDate(addDays(now, offset)));

    const days = (
      await Promise.all(dates.map((date) => fetchPradcastDay(date, apiKey)))
    ).filter((day) => day !== null);

    if (days.length === 0) {
      console.warn('Ceny pradcast: żadna doba się nie powiodła — zostawiam poprzedni plik.');
      return;
    }

    const file = pricesFile(days, existing, now);
    const nextText = `${JSON.stringify(file, null, 2)}\n`;
    const currentText = (() => {
      try {
        return readFileSync(pricesTarget, 'utf8');
      } catch {
        return null;
      }
    })();

    if (nextText !== currentText) {
      mkdirSync(dirname(pricesTarget), { recursive: true });
      writeFileSync(pricesTarget, nextText);
      console.log(`Ceny pradcast: zapisano public/ceny.json (${days.length} dob).`);
    } else {
      console.log('Ceny pradcast: bez zmian wobec poprzedniego pliku.');
    }

    const partitionPath = resolve(pricesArchiveDir, `${archivePartition(now)}.jsonl`);
    let archiveText = '';
    try {
      archiveText = readFileSync(partitionPath, 'utf8');
    } catch {
      // First line ever for this partition.
    }

    const newLines = archiveLines(days, archiveText, now);
    if (newLines.length > 0) {
      mkdirSync(pricesArchiveDir, { recursive: true });
      appendFileSync(partitionPath, `${newLines.join('\n')}\n`);
      console.log(`Ceny pradcast: dopisano ${newLines.length} wierszy do archiwum cen.`);
    } else {
      console.log('Ceny pradcast: archiwum cen bez zmian.');
    }
  } catch (error) {
    console.warn(`Ceny pradcast pominiete w tym przebiegu: ${String(error)}`);
  }
}

/** Feeds are read at most this often; the card says "stan HH:MM", and headlines do not move by the quarter hour. */
const NEWS_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;

/**
 * Writes public/news.json — industry headlines for the "Z branży" card.
 *
 * Every two hours, not every run: each write changes public/ and so rebuilds
 * the site, and nine outside servers do not need asking four times an hour.
 * The marker is written before the feeds are read, like the prices one, so a
 * run that dies half-way still counts as having asked.
 *
 * A run where every feed failed leaves the previous file in place; the card
 * then ages into "nieaktualne" on its own and disappears after twelve hours.
 */
async function writeNews(now: Date): Promise<void> {
  try {
    const lastFetch = (() => {
      try {
        const raw = JSON.parse(readFileSync(newsLastFetchTarget, 'utf8')) as { at?: string };
        const parsed = typeof raw.at === 'string' ? new Date(raw.at) : null;
        return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
      } catch {
        return null;
      }
    })();
    const hasFile = (() => {
      try {
        return readNewsFile(JSON.parse(readFileSync(newsTarget, 'utf8'))) !== null;
      } catch {
        return false;
      }
    })();

    if (hasFile && lastFetch && now.getTime() - lastFetch.getTime() < NEWS_MIN_INTERVAL_MS) {
      console.log('Wiadomosci: ostatni odczyt mniej niz 2 h temu — pomijam w tym przebiegu.');
      return;
    }

    mkdirSync(dirname(newsLastFetchTarget), { recursive: true });
    writeFileSync(newsLastFetchTarget, `${JSON.stringify({ at: now.toISOString() })}\n`);

    const file = await collectNews(now);
    const count = file.groups.reduce((sum, group) => sum + group.items.length, 0);
    if (count === 0) {
      console.warn('Wiadomosci: zaden kanal nie dal wpisow — zostawiam poprzedni plik.');
      return;
    }

    mkdirSync(dirname(newsTarget), { recursive: true });
    writeFileSync(newsTarget, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`Wiadomosci: zapisano public/news.json (${count} naglowkow).`);
  } catch (error) {
    console.warn(`Wiadomosci pominiete w tym przebiegu: ${String(error)}`);
  }
}

/**
 * Recomputes the call-period study (data/badanie.json) from the two archives
 * and the hand-kept event register — research, not product. It lives in
 * `data/` on purpose: the workflow commits everything there but deploys only
 * on a changed summary.json, so this file reaches the research subpage
 * (which reads it straight from the repository) without ever rebuilding the
 * site or churning the service worker on a phone.
 *
 * Reads the previous and current partitions only, like the archives do —
 * two months of days is plenty for a rank against "the rest of the record"
 * and keeps the file small enough to fetch on every open of the subpage.
 * Wrapped whole for the same reason as every archive above: the summary is
 * the product, this is a study, and a study failing must never end the run.
 */
const OBSERVATIONS_REPO = 'bartorux/dashboard-iphone';

/**
 * The owner's Issues-filed observations — see `src/utils/obserwacje.ts` for
 * the title format both this and the research page agree on.
 *
 * Unauthenticated (no `GITHUB_TOKEN`) still works: Issues on a public repo
 * are readable without a token, just at the lower unauthenticated rate limit,
 * which an hourly job never comes close to. The token is added whenever the
 * workflow provides one, mostly to keep this call away from that limit
 * entirely rather than out of necessity.
 *
 * Every failure — network, HTTP, a shape that is not an array — resolves to
 * an empty list rather than throwing: a missing observation this hour is
 * simply a day the study cannot yet caption, never a reason to fail the run.
 */
async function fetchObservationIssues(): Promise<IssueLike[]> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pse-dashboard-summary',
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(
      `https://api.github.com/repos/${OBSERVATIONS_REPO}/issues?state=all&per_page=100`,
      { headers }
    );
    if (!response.ok) {
      console.warn(`Obserwacje z Issues pominiete: GitHub odpowiedzial HTTP ${response.status}.`);
      return [];
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      console.warn('Obserwacje z Issues pominiete: nieoczekiwany ksztalt odpowiedzi GitHub.');
      return [];
    }

    // Issues and pull requests share one endpoint; a PR carries its own
    // `pull_request` field and is never something the owner filed as an
    // observation, so it is dropped here rather than fed to the parser.
    return (payload as Array<Record<string, unknown>>)
      .filter((item) => !item.pull_request)
      .map((item) => ({
        number: Number(item.number),
        title: String(item.title ?? ''),
        body: typeof item.body === 'string' ? item.body : null,
      }));
  } catch (error) {
    console.warn(`Obserwacje z Issues pominiete w tym przebiegu: ${String(error)}`);
    return [];
  }
}

async function writeBadanie(at: Date): Promise<void> {
  try {
    const partition = archivePartition(at);
    const partitions = [previousPartition(partition), partition];
    const readPartition = (dir: string, name: string): string => {
      try {
        return readFileSync(resolve(dir, `${name}.jsonl`), 'utf8');
      } catch {
        return '';
      }
    };
    const rows = parseArchiveRows(
      partitions.map((name) => readPartition(archiveDir, name)).join('\n')
    );
    const compass = partitions.flatMap((name) =>
      compassVersionRows(readPartition(compassArchiveDir, name))
    );
    let events: CallEvent[] = [];
    try {
      const parsed = JSON.parse(readFileSync(eventsTarget, 'utf8')) as { events?: CallEvent[] };
      events = Array.isArray(parsed.events) ? parsed.events : [];
    } catch {
      // No register yet — the study still runs, every day simply scores as
      // "no event on record", which is what the register would have said.
    }

    const issues = await fetchObservationIssues();
    const issueObservations: Observation[] = observationsFromIssues(issues);

    // The CURRENT day-ahead forecast, per business date — this run's own
    // `points`, already computed above for the summary text. Lets the study
    // mark `DayStudy.exchangePlanned` from the SAME forecast a reader of the
    // page would see right now, not from the archive alone.
    const forecastByDate = new Map<string, Array<{ exchange: number | null }>>();
    for (const point of points) {
      const bucket = forecastByDate.get(point.businessDate);
      if (bucket) bucket.push({ exchange: point.exchange });
      else forecastByDate.set(point.businessDate, [{ exchange: point.exchange }]);
    }

    const file = buildBadanieWithObservations(
      rows,
      compass,
      events,
      issueObservations,
      at,
      forecastByDate
    );
    // Compact on purpose: this file is fetched by a browser, and the readings
    // list alone runs to thousands of entries a month.
    writeFileSync(badanieTarget, `${JSON.stringify(file)}\n`);
    console.log(`Badanie przywolan: ${file.days.length} dob, zapisano data/badanie.json.`);
  } catch (error) {
    console.warn(`Badanie przywolan pominiete w tym przebiegu: ${String(error)}`);
  }
}

/** True while the archive has never been written to — the one condition
 *  `seedCompassArchive` runs under. */
function isCompassArchiveEmpty(): boolean {
  try {
    return readdirSync(compassArchiveDir).length === 0;
  } catch {
    return true; // directory does not exist yet
  }
}

/**
 * ONE-TIME backfill of the Kompas archive from PSE's own version history —
 * this is PSE's history, not something this job observed. Runs only while
 * `data/kompas-archiwum/` is still empty: every later run only ever sees the
 * live pdgsz endpoint, which serves the active version alone, so this is the
 * one chance to recover whatever versions PSE is still willing to hand back
 * from before this archive existed. Once the directory holds anything at all,
 * this becomes a no-op forever — including on every scheduled run after the
 * first one that lands after this code ships.
 *
 * Written with `readAt` := each row's own `publication_ts_utc`: this backfill
 * has no real "moment this job read it", so the only honest instant to record
 * is the one PSE itself stamped the version with. That also means the
 * partition a version belongs in is the month of ITS publication stamp, not
 * the month `at` falls in — a version published in August must land in
 * August's file even when the seed itself runs in September.
 */
async function seedCompassArchive(at: Date): Promise<void> {
  try {
    if (!isCompassArchiveEmpty()) {
      console.log('Zasilenie historii Kompasu pominiete — archiwum juz istnieje.');
      return;
    }

    const from = '2026-08-25';
    const to = formatDate(addDays(at, 2));
    const rows = await fetchCompassHistory(from, to);
    if (rows.length === 0) {
      console.log('Zasilenie historii Kompasu: PSE nie zwrocilo zadnych wersji.');
      return;
    }

    // Oldest first, so each key's versions are compared in the order PSE
    // actually published them — the same order a live run would have seen
    // them in, one hour at a time, had this archive existed back then.
    const sorted = [...rows].sort((a, b) =>
      String(a.publication_ts_utc ?? '').localeCompare(String(b.publication_ts_utc ?? ''))
    );

    const linesByPartition = new Map<string, string[]>();
    // One running dedupe map per partition, seeded from whatever that
    // partition's file already holds (empty here, since the whole point of
    // this function is that the archive starts empty, but kept symmetrical
    // with `archiveCompass` rather than assuming so).
    const runningByPartition = new Map<
      string,
      Map<string, { level: 0 | 1 | 2 | 3; publicationTsUtc: string }>
    >();
    let skipped = 0;

    const readPartition = (path: string): string => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return '';
      }
    };

    for (const row of sorted) {
      // `newCompassArchiveLines` converts each row's own stamp the same way
      // internally, but the partition a version belongs in has to be known
      // BEFORE calling it — so the same conversion is done here too, once,
      // purely to place the line. A row with no usable stamp at all cannot be
      // dated, which for a backfill (unlike a live run, where `readAt` is
      // simply "now") means there is nothing honest left to record it as.
      const publicationTsUtc = publicationTsToIso(row.publication_ts_utc);
      if (!publicationTsUtc) {
        skipped += 1;
        continue;
      }

      const partition = archivePartition(new Date(publicationTsUtc));
      if (!runningByPartition.has(partition)) {
        const partitionPath = resolve(compassArchiveDir, `${partition}.jsonl`);
        const previousPath = resolve(
          compassArchiveDir,
          `${previousPartition(partition)}.jsonl`
        );
        runningByPartition.set(
          partition,
          lastCompassValuesFrom([readPartition(previousPath), readPartition(partitionPath)])
        );
      }

      const lastByKey = runningByPartition.get(partition)!;
      const lines = newCompassArchiveLines([row], lastByKey, publicationTsUtc);
      if (lines.length === 0) continue;

      const [line] = lines;
      const [businessDate, hour, level] = JSON.parse(line) as [
        string,
        number,
        0 | 1 | 2 | 3,
        string,
        string,
      ];
      // `newCompassArchiveLines` never mutates its input map (by design, so
      // that live runs can dedupe a batch against an untouched copy of what
      // is already on disk) — so the running state for this partition has to
      // be advanced by hand here, or the next version of the same hour would
      // dedupe against nothing and every version PSE ever published would be
      // written back out as if it were new.
      lastByKey.set(`${businessDate}#${hour}`, { level, publicationTsUtc });

      const bucket = linesByPartition.get(partition);
      if (bucket) bucket.push(line);
      else linesByPartition.set(partition, [line]);
    }

    if (linesByPartition.size === 0) {
      console.log(`Zasilenie historii Kompasu: nic do zapisania (pominieto ${skipped}).`);
      return;
    }

    mkdirSync(compassArchiveDir, { recursive: true });
    let written = 0;
    for (const [partition, lines] of linesByPartition) {
      const partitionPath = resolve(compassArchiveDir, `${partition}.jsonl`);
      appendFileSync(partitionPath, `${lines.join('\n')}\n`);
      written += lines.length;
    }

    console.log(
      `Zasilenie historii Kompasu z wersji PSE: zapisano ${written} wierszy w ${linesByPartition.size} partycjach (pominieto ${skipped} bez uzytecznego znacznika publikacji).`
    );
  } catch (error) {
    console.warn(`Zasilenie historii Kompasu pominiete: ${String(error)}`);
  }
}

const [forecast, history] = await Promise.all([
  fetchPSEData(
    // The archive stamps every reading with the PSE revision it came from;
    // without this column the stamp would be forever empty (see pk5lArchive).
    `${FORECAST_FIELDS},publication_ts_utc`
  ),
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

// One-time, and a no-op the moment the archive holds anything at all — see
// the function's own comment. Placed before the live Kompas fetch below so a
// first-ever run seeds history before also archiving today's live reading.
if (!dryRun) await seedCompassArchive(now);

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
  if (!dryRun) archiveCompass(surowe, now);
  for (const hour of parseCompass(surowe)) {
    const bucket = kompas.get(hour.businessDate);
    if (bucket) bucket.push(hour);
    else kompas.set(hour.businessDate, [hour]);
  }
} catch {
  // No compass this run. The card simply says nothing about it, which is what
  // it says on the great majority of days anyway.
}

// After both archives have taken this hour's rows, so the study sees them —
// and before the first exit below, so a quiet day still gets re-scored.
if (!dryRun) await writeBadanie(now);

// Independent of the summary text entirely — a day with no facts to write
// about (the exit right below) still has a price strip worth refreshing.
if (!dryRun) await writePrices(now);

// Unrelated to the summary as well, and for the same reason placed before the
// early exit below.
if (!dryRun) await writeNews(now);

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
