/**
 * Whether the summary needs rewriting at all.
 *
 * Pulled out of the generator script so it can be tested. As a chain of
 * `process.exit` calls at the top level of a module it could not be, and this
 * is precisely where problems stayed hidden: for three rounds the text sat
 * frozen while every rerun reported "no change", because a refusal and a quiet
 * hour end the same way from outside.
 */

/**
 * Rewrite anyway once the stored text gets old, even when nothing has moved.
 *
 * The card hides a summary past twelve hours, so a genuinely quiet night — the
 * forecast stable, today's hours spent — would let the assessment sit unchanged
 * long enough for the card to vanish by morning. It would disappear not because
 * anything was wrong but because the text was judged still good, which is
 * precisely backwards: a calm night is when "nothing to worry about" is worth
 * saying. Half the display cutoff, so there is always a wide margin.
 */
export const MAX_STALE_MS = 6 * 60 * 60 * 1000;

export interface RunDecision {
  generate: boolean;
  /** Said plainly enough to appear in the job log. */
  reason: string;
}

/** One ask of the model, judged. */
export interface Proba<T> {
  ok: boolean;
  /** Null when the answer could not even be parsed into the three fields. */
  summary: T | null;
  reason?: string;
  /**
   * The unparsed answer, carried only when parsing failed. Its shape is the
   * whole diagnosis and it cannot be reconstructed from anything else, so the
   * caller writes it to the log in place of the fields it never had.
   */
  raw?: string;
}

/**
 * Ask again when the answer is refused.
 *
 * Until now a refusal ended the job and left the card standing with the
 * previous text until the next hour. On the night of 17 August seven refusals
 * in a row held it unchanged for six hours, and every gate we add makes that
 * more likely — a gate costs an hour of stale card per hit, false hits
 * included.
 *
 * The retry deliberately sends THE SAME prompt. Telling the model why it was
 * refused would mean naming the thing it must not write, and naming a phrase to
 * forbid it is how four of them spread across this card in a single day. The
 * variation comes from `temperature`, which already produces a different text
 * every hour on identical facts.
 *
 * What this does not do is rescue a systematic refusal: the seven that night
 * shared one cause and would have failed on every attempt. It covers the
 * sporadic tail — an overlong field, a stray figure — and stops those from
 * costing the reader an hour.
 */
export async function askWithRetry<T>(
  ask: () => Promise<string | null>,
  judge: (text: string) => Proba<T>,
  record: (attempt: Proba<T>) => void,
  attempts = 2
): Promise<Proba<T>> {
  let last: Proba<T> = { ok: false, summary: null, reason: 'Model nie zwrocil tekstu' };

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
    const text = await ask();
    // No text at all is a failed attempt, not a crash: the model occasionally
    // returns an empty candidate, and that is exactly the case a second ask
    // tends to resolve.
    last = text === null ? { ok: false, summary: null, reason: 'Model nie zwrocil tekstu' } : judge(text);
    // Every attempt is written down, refused ones included. Logging only the
    // last would hide how often the first misses, and that rate is the only
    // signal we have for whether the gates are set right.
    record(last);
    if (last.ok) return last;
  }

  return last;
}

export interface RunInput {
  /** Assessment recorded alongside the stored text, or null when there is none. */
  storedAssessment: string | null;
  /** When the stored text was written, or null when there is none. */
  storedAt: Date | null;
  /** Assessment computed from the forecast as it stands now. */
  key: string;
  now: Date;
}

export function decideRun({
  storedAssessment,
  storedAt,
  key,
  now,
}: RunInput): RunDecision {
  if (storedAssessment === null || storedAt === null) {
    return { generate: true, reason: 'Brak zapisanego podsumowania' };
  }

  if (storedAssessment !== key) {
    return { generate: true, reason: 'Ocena sie zmienila' };
  }

  const age = now.getTime() - storedAt.getTime();

  // A stored timestamp in the future means a clock disagreement somewhere;
  // treating it as fresh would freeze the text until it aged into the past.
  if (age < 0) {
    return { generate: true, reason: 'Zapisany czas jest z przyszlosci' };
  }

  if (age >= MAX_STALE_MS) {
    const hours = Math.round(age / (60 * 60 * 1000));
    return {
      generate: true,
      reason: `Ocena bez zmian, ale tekst ma ${hours} godz. — odswiezam, zanim karta go schowa`,
    };
  }

  const hours = Math.round(age / (60 * 60 * 1000));
  return {
    generate: false,
    reason: `Ocena bez zmian, tekst sprzed ${hours} godz.`,
  };
}
