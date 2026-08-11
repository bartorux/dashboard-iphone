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

/** Three days of hourly runs, the same depth the forecast log keeps. */
export const LOG_LIMIT = 72;

export const EMPTY_LOG: SummaryLog = { attempts: [] };

export function appendAttempt(
  log: SummaryLog,
  attempt: Attempt,
  limit = LOG_LIMIT
): SummaryLog {
  const attempts = [...log.attempts, attempt];
  return { attempts: attempts.slice(Math.max(0, attempts.length - limit)) };
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
