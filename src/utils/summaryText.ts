import { DayFacts, renderFacts } from './summaryFacts';

export interface Summary {
  headline: string;
  body: string;
  outlook: string;
}

/**
 * Written in correct Polish on purpose, diacritics and all. Runs where the
 * instruction was plain ASCII came back stripped of them, and once with an
 * invented escape — a Hungarian ű where ż belonged. The model mirrors the
 * register of its prompt, and the prompt is the bulk of the request.
 */
export const INSTRUCTION = `Na podstawie PONIŻSZYCH FAKTÓW napisz krótkie podsumowanie
po polsku o rezerwach mocy w krajowej sieci elektroenergetycznej.

JĘZYK — to najważniejsze:
- Odbiorcy pracują w energetyce. Pisz zawodowo i rzeczowo, ale bez żargonu.
- ZAKAZANE zwroty, bo nic nie wnoszą: „sytuacja bilansowa", „bilans systemowy",
  „zasoby DSR", „jednostki DSR", „ciągłość pracy", „profil generacji".
- ZAKAZANE kolokwializmy, na przykład „zrobi się ciasno", „na styk".
- Mów wprost: rezerwa mocy, wymagana rezerwa, margines, okres przywołania.
- Krótkie zdania. Pisz poprawną polszczyzną, z polskimi znakami.

ZASADY, bezwzględnie:
- NIE podawaj żadnych liczb. Żadnych megawatów, procentów, liczby godzin.
  Nie zapisuj ich też słownie. Jedyne dozwolone cyfry to godziny w formacie
  HH:MM występujące w faktach.
- Nie wymyślaj faktów. Pisz wyłącznie o tym, co jest poniżej.
- Nie pisz o teście ani o testowym okresie przywołania — tych danych nie mamy.
- Nie przypisuj operatorowi zamiarów ani przewidywań. Nie wiemy, co planuje.
  Pisz o tym, czy są PODSTAWY do przywołania, nie o tym, co operator zrobi.
- Nie pisz w pierwszej osobie liczby mnogiej.
- Bez dramatyzowania i bez uspokajania na siłę. Bez zdań pustych w rodzaju
  „sytuacja będzie monitorowana".
- NIE POWTARZAJ zasad ogłaszania przywołania. Czytelnik je zna.

NAJWAŻNIEJSZE ROZRÓŻNIENIE, nie pomyl go:
- Margines DODATNI oznacza, że dostępna rezerwa POKRYWA wymaganą. Nawet bardzo
  cienki margines nadal ją pokrywa.
- Tylko margines UJEMNY oznacza, że rezerwa spadła poniżej wymaganej.
- Nigdy nie pisz, że rezerwa spadła poniżej wymaganej, jeśli fakty tego nie mówią.

Kontekst: okres przywołania to sytuacja, w której operator sieci wzywa odbiorców
do ograniczenia poboru.

FORMAT ODPOWIEDZI — dokładnie trzy linie, każda z etykietą na początku:
NAGŁÓWEK: jedno zdanie, najważniejsza rzecz.
TREŚĆ: dwa do trzech zdań o tym, co się dzieje i z czym można się zmierzyć.
DALEJ: jedno zdanie o kolejnych dniach.

Żadnego JSON-a, żadnych cudzysłowów wokół pól, żadnych sekwencji ucieczki.

FAKTY:
`;

/**
 * A different thing to lead with each hour.
 *
 * The text is rewritten hourly while the verdict rarely moves, so left to
 * itself the model opened the same way every time and the card stopped being
 * read. Rotating what it starts from changes the shape of the sentence rather
 * than dressing the same sentence in synonyms — which matters here, because on
 * a monitoring screen fresh wording over unchanged facts reads as fresh news.
 *
 * Keyed to the hour rather than drawn at random, so the same facts at the same
 * hour give the same text and a rerun is not a lottery.
 */
const EMPHASES = [
  'Zacznij od tego, co czeka najbliżej w czasie.',
  'Zacznij od najtrudniejszej godziny w całym horyzoncie.',
  'Zacznij od tego, czy sytuacja jest typowa na tle ostatnich dni.',
  'Zacznij od dnia, który wygląda najgorzej, choćby był ostatni.',
  'Zacznij od stwierdzenia, czy w ogóle są podstawy do przywołania.',
] as const;

export function emphasisFor(now: Date): string {
  return EMPHASES[now.getUTCHours() % EMPHASES.length];
}

export function buildPrompt(
  facts: DayFacts[],
  historyDays: number,
  now: Date
): string {
  return (
    INSTRUCTION +
    renderFacts(facts, historyDays) +
    `\n\nUJĘCIE NA TEN RAZ: ${emphasisFor(now)}`
  );
}

/**
 * Labelled lines rather than JSON. Forced to emit JSON the model hand-wrote its
 * own escape sequences and got them wrong; plain text has nothing to escape.
 */
export function parseSummary(text: string): Summary | null {
  const field = (label: string) => {
    const match = new RegExp(`^${label}:\\s*(.+)$`, 'mi').exec(text);
    return match ? match[1].trim() : '';
  };

  const summary = {
    headline: field('NAGŁÓWEK'),
    body: field('TREŚĆ'),
    outlook: field('DALEJ'),
  };

  return summary.headline && summary.body && summary.outlook ? summary : null;
}

/** Generous, but enough to catch a runaway answer. */
const LIMITS: Record<keyof Summary, number> = {
  headline: 200,
  body: 500,
  outlook: 200,
};

const HOUR_PATTERN = /\b\d{1,2}:\d{2}\b/g;

/**
 * The one rule the whole design rests on: every figure the reader sees comes
 * from our own arithmetic. So the prose may carry no number at all, save an hour
 * that appears in the facts — and even that must be one we actually computed.
 *
 * Rejection is not a failure state. Keeping yesterday's good summary beats
 * replacing it with a wrong one.
 */
export function validateSummary(
  summary: Summary,
  allowedHours: Set<string>
): { ok: true } | { ok: false; reason: string } {
  for (const [key, limit] of Object.entries(LIMITS) as Array<
    [keyof Summary, number]
  >) {
    const value = summary[key];
    if (!value.trim()) return { ok: false, reason: `puste pole ${key}` };
    if (value.length > limit) {
      return { ok: false, reason: `pole ${key} dłuższe niż ${limit} znaków` };
    }
  }

  const whole = `${summary.headline}\n${summary.body}\n${summary.outlook}`;

  // Told not to use digits, one run simply spelled the figure out instead.
  if (/megawat|MW\b|procent/i.test(whole)) {
    return { ok: false, reason: 'tekst podaje wielkość mocy' };
  }

  // Loosened settings have twice produced Polish stripped of its diacritics, once
  // with an invented escape — a Hungarian ű where ż belonged. A passage this long
  // that contains not one of them was not written in Polish so much as near it.
  if (!/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(whole)) {
    return { ok: false, reason: 'tekst bez polskich znaków' };
  }

  for (const hour of whole.match(HOUR_PATTERN) ?? []) {
    if (!allowedHours.has(hour)) {
      return { ok: false, reason: `godzina ${hour} spoza faktów` };
    }
  }

  const withoutHours = whole.replace(HOUR_PATTERN, '');
  if (/\d/.test(withoutHours)) {
    return { ok: false, reason: 'tekst zawiera liczbę spoza godzin' };
  }

  return { ok: true };
}
