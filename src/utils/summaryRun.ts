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
