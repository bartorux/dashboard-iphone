/**
 * Every answer the model gave, kept so a day of them can be read at once.
 *
 * Published summaries are recoverable from git — each refresh is a commit — but
 * two things are not. Refused answers leave no trace at all beyond a warning
 * naming the reason, so the one rejection today told us the rule that fired and
 * nothing about how close the text had been. And a day's worth of texts spread
 * across twenty commits is not something anyone will actually sit and read.
 *
 * The point is not archiving. It is being able to see which runs were weak, and
 * a weak run is only visible next to the others.
 */

export interface Attempt {
  at: string;
  /** PROMPT_VERSION in force, so a change of shape can be told from a bad draw. */
  prompt: number;
  accepted: boolean;
  /** Why it was refused, absent when it was not. */
  reason?: string;
  headline: string;
  body: string;
  outlook: string;
}

export interface SummaryLog {
  attempts: Attempt[];
}

/**
 * 72 HOURS, not 72 attempts.
 *
 * That was the previous rule, and the assumption behind it — an attempt is
 * written only when the model is actually asked, following the assessment
 * changing (or six hours passing), so the count would not grow with the run
 * cadence — did not survive contact with the live log. Measured on 09.09: the
 * 72 stored attempts spanned 08.09 16:30 to 09.09 07:15, fifteen hours, about
 * 36 attempts a day — the grid has been restless enough that a count meant to
 * outlast "days, not hours" was in fact holding less than one day. A count
 * cannot promise a span at all, because it says nothing about how often the
 * assessment happens to change; only a window can.
 *
 * Matches `forecastLog.ts`'s `LOG_WINDOW_MS` exactly, including its guards:
 * the window is measured against the incoming attempt's own stamp, so
 * `appendAttempt` stays pure and a re-run over old data cannot quietly empty
 * the log.
 */
export const LOG_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * A safety ceiling on the file, not a retention rule.
 *
 * The window above decides what is worth keeping; this only bounds what a
 * much faster cadence than measured could do to the file size. The job asks
 * at most once per run, so the physical worst case inside a 72 h window is
 * one ask on every quarter-hourly run: 4 a hour × 72 h = 288. 300 sits just
 * above that, comfortably above the ~108 the measured 09.09 rate (36 a day)
 * implies for the same window. At ~620 B per attempt (measured: 44.7 kB
 * across 72 entries on 09.09) the file runs ~67 kB at the measured rate and
 * ~186 kB at the ceiling — rewritten on every run, same as forecastLog.
 */
export const LOG_CAP = 300;

/**
 * A floor on what the window may take away.
 *
 * The window is measured against the incoming attempt's own stamp, which is
 * what keeps `appendAttempt` pure — and hands a broken runner clock a way to
 * erase the whole history in one write: one attempt stamped far in the future
 * puts every real attempt outside the window. Retention still belongs to the
 * window; this only says it may never leave less than half a day of drafts,
 * at the measured 09.09 rate of 36 attempts a day — 18 entries. The price:
 * after a real multi-day gap in asking, the floor holds old attempts for up
 * to half a day longer, which is the same coarseness the old count-based
 * slice always had.
 */
export const LOG_FLOOR = 18;

export const EMPTY_LOG: SummaryLog = { attempts: [] };

/**
 * Add an attempt and drop what has aged out.
 *
 * Unlike `forecastLog.ts`'s `appendEntry`, there is no "unless it repeats the
 * last one" guard: here repetition IS the finding — the same wording hour
 * after hour is what "the card stopped being read" looks like — so every
 * attempt is kept, and only the window, floor and cap below ever remove one.
 */
export function appendAttempt(
  log: SummaryLog,
  attempt: Attempt,
  windowMs = LOG_WINDOW_MS,
  cap = LOG_CAP
): SummaryLog {
  const attempts = [...log.attempts, attempt];
  const newest = Date.parse(attempt.at);

  // An unreadable stamp on the incoming attempt leaves the window unapplied
  // rather than dropping the whole history: nothing can be placed in time,
  // and losing days of drafts over one bad string is the larger harm.
  const kept = Number.isFinite(newest)
    ? attempts.filter((candidate) => {
        const at = Date.parse(candidate.at);
        return Number.isFinite(at) && newest - at <= windowMs;
      })
    : attempts;

  const guarded =
    kept.length >= LOG_FLOOR
      ? kept
      : attempts.slice(Math.max(0, attempts.length - LOG_FLOOR));

  return { attempts: guarded.slice(Math.max(0, guarded.length - cap)) };
}

/**
 * Parse a log from disk, treating anything unexpected as no history.
 *
 * A corrupt log must never fail the run: the summary is the product and this is
 * a notebook. Losing three days of drafts is a smaller harm than a scheduled job
 * that stops producing text.
 */
export function parseLog(raw: unknown): SummaryLog {
  if (typeof raw !== 'object' || raw === null) return EMPTY_LOG;

  const attempts = (raw as { attempts?: unknown }).attempts;
  if (!Array.isArray(attempts)) return EMPTY_LOG;

  return {
    attempts: attempts.filter((entry): entry is Attempt => {
      if (typeof entry !== 'object' || entry === null) return false;
      const candidate = entry as Record<string, unknown>;
      return (
        typeof candidate.at === 'string' &&
        !Number.isNaN(Date.parse(candidate.at)) &&
        typeof candidate.headline === 'string'
      );
    }),
  };
}

/** The whole answer as one string, for counting things across its three lines. */
function whole(attempt: Attempt): string {
  return [attempt.headline, attempt.body, attempt.outlook]
    .filter(Boolean)
    .join(' ');
}

export interface Signals {
  /** How often the text names the thing it is about. Twice is a repetition. */
  przywolania: number;
  /** Characters, so a draft that has grown wordy stands out. */
  dlugosc: number;
  /** The longest run of words that appears twice, or '' when nothing repeats. */
  powtorzenie: string;
}

/**
 * What to look at first when reading a day of drafts.
 *
 * Deliberately mechanical: these are the three faults that actually recurred —
 * the verdict said twice, a draft creeping longer, and one clause copied between
 * two lines. Judging the prose is still a person's job; this only says where to
 * look.
 */
export function signalsFor(attempt: Attempt): Signals {
  const text = whole(attempt);
  const words = text
    .toLowerCase()
    .replace(/[.,;:—–-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let longest: string[] = [];
  // Four words is short enough to catch "nie ma podstaw do" and long enough that
  // ordinary Polish does not trip it by accident.
  for (let size = 4; size <= 12; size++) {
    const seen = new Set<string>();
    for (let start = 0; start + size <= words.length; start++) {
      const phrase = words.slice(start, start + size).join(' ');
      if (seen.has(phrase) && size > longest.length) {
        longest = words.slice(start, start + size);
      }
      seen.add(phrase);
    }
  }

  return {
    przywolania: (text.match(/przywoła/gi) ?? []).length,
    dlugosc: text.length,
    powtorzenie: longest.join(' '),
  };
}
