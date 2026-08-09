import { DayFacts, renderFacts } from './summaryFacts';

export interface Summary {
  headline: string;
  body: string;
  outlook: string;
}

/**
 * Bumped whenever the instruction or the wording of the facts changes.
 *
 * The stored text is skipped while the assessment looks unchanged, and the
 * assessment measures values rather than words — so a rewritten prompt would
 * have taken effect only once the grid itself moved, leaving a summary written
 * under rules we had since corrected. Twice already that would have kept a
 * sentence in place that contradicted itself.
 *
 * Raising this forces exactly one regeneration and nothing more.
 */
export const PROMPT_VERSION = 4;

/**
 * Written in correct Polish on purpose, diacritics and all. Runs where the
 * instruction was plain ASCII came back stripped of them, and once with an
 * invented escape — a Hungarian ű where ż belonged. The model mirrors the
 * register of its prompt, and the prompt is the bulk of the request.
 */
export const INSTRUCTION = `Na podstawie PONIŻSZYCH FAKTÓW napisz krótkie podsumowanie
po polsku o rezerwach mocy w krajowej sieci elektroenergetycznej.

JAK MASZ PISAĆ — to najważniejsze:
- Jak dyżurny inżynier, który mówi koledze, czego się spodziewać. Zawodowo,
  ale normalnie. Odbiorcy pracują w energetyce.
- CZASOWNIKI, nie rzeczowniki odczasownikowe. Pisz „rezerwa spadnie", nie
  „nastąpi spadek rezerwy". Pisz „nie pokryje", nie „wystąpi brak pokrycia".
- KONKRETNE GODZINY, kiedy fakty je podają. Pisz „między 18:00 a 19:00", nigdy
  „w wyznaczonym przedziale czasowym" ani „w godzinach wieczornych".
- Jedno zdanie, jedna myśl. Nie równoważ każdego zdania zastrzeżeniem —
  powiedz rzecz wprost, a zastrzeżenie dodaj tylko wtedy, gdy naprawdę zmienia
  wniosek.
- Wytnij watę: „w pełni", „również", „ponadto", „w chwili obecnej", „należy
  zauważyć". Jeśli słowo można usunąć bez straty, usuń je.
- Pisz poprawną polszczyzną, z polskimi znakami.

TAK NIE PISZ (asekuranckie, zdystansowane, bez konkretu):
„W poniedziałek w wyznaczonym przedziale czasowym rezerwa nie pokrywa w pełni
wymaganej wielkości, w związku z czym występuje ryzyko wezwania odbiorców."

TAK PISZ (wprost, z godzinami, czasownikami):
„W poniedziałek między 18:00 a 19:00 rezerwa nie pokryje wymaganej. Nadwyżka
zostaje jednak powyżej progu 1100 MW, więc operator może przywołania nie ogłaszać."

ZAKAZANE zwroty, bo nic nie wnoszą: „sytuacja bilansowa", „bilans systemowy",
„zasoby DSR", „jednostki DSR", „ciągłość pracy", „profil generacji".
ZAKAZANE kolokwializmy, na przykład „zrobi się ciasno", „na styk".
Nazywaj rzeczy po imieniu: rezerwa mocy, wymagana rezerwa, margines, przywołanie.

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

NAJWAŻNIEJSZE ROZRÓŻNIENIE, nie pomyl go W ŻADNĄ STRONĘ:
- Margines DODATNI oznacza, że dostępna rezerwa POKRYWA wymaganą. Nawet bardzo
  cienki margines nadal ją pokrywa.
- Margines UJEMNY oznacza, że rezerwa NIE POKRYWA wymaganej. To są dwa opisy
  tego samego faktu, nie dwie osobne informacje.
- Nigdy nie pisz, że rezerwa spadła poniżej wymaganej, jeśli margines jest dodatni.
- Nigdy nie pisz, że rezerwa pokrywa wymaganą, jeśli margines jest ujemny.
- ZDANIE ZAKAZANE, bo przeczy samo sobie: „rezerwa pokrywa wymaganą wartość,
  choć margines jest ujemny". Jeśli margines jest ujemny, napisz wprost, że
  rezerwa nie pokrywa wymaganej.

Kontekst: okres przywołania to sytuacja, w której operator sieci wzywa odbiorców
do ograniczenia poboru. Ogłasza go w dzień roboczy między 07:00 a 22:00,
z co najmniej ośmiogodzinnym wyprzedzeniem.

DWIE RÓŻNE WIELKOŚCI — nazywaj je osobno, nigdy obie „progiem":
- WYMAGANA REZERWA — poziom, który rezerwa ma pokryć. Zmienia się co godzinę.
- PRÓG 1100 MW — osobna wartość regulacyjna. Powyżej niej operator może nie
  ogłaszać przywołania.
Rezerwa potrafi być poniżej wymaganej i jednocześnie powyżej progu 1100 MW.
To nie jest sprzeczność, to są dwie różne rzeczy.

TRZY STANY — nie zlewaj ich w „ryzyko":
- „OPERATOR MOŻE NIE OGŁASZAĆ" znaczy: rezerwa nie pokrywa wymaganej, ale
  nadwyżka trzyma się powyżej progu 1100 MW, więc przepis pozwala operatorowi
  przywołania nie ogłaszać. Pisz właśnie tak: że operator może go nie ogłaszać.
- „PRZYWOŁANIE POWINNO ZOSTAĆ OGŁOSZONE" znaczy: nadwyżka spadła poniżej progu
  1100 MW, więc operator nie ma już podstaw, by go nie ogłaszać. Nie pisz „musi"
  ani „na pewno" — to nie jest gwarancja.
- „brak podstaw" znaczy dokładnie tyle: rezerwa pokrywa wymaganą albo godzina
  wypada poza dniem roboczym lub oknem 07:00-22:00.

NARRACJA — to jest informacja, nie ostrzeżenie:
- Nie pisz tak, jakby przywołanie było przesądzone, dopóki fakty tego nie mówią.
  Przy stanie „operator może nie ogłaszać" najczęściej nic się nie wydarzy.
- Nie strasz i nie dramatyzuj. Nie używaj słów „zagrożenie", „krytyczny",
  „alarmujący", „niebezpieczny".
- Ale też nie pocieszaj na siłę. Jeśli rezerwa nie pokrywa wymaganej, napisz to
  wprost i spokojnie.

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
  'Zacznij od dnia, który wymaga najwięcej uwagi, choćby był ostatni.',
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

  /*
   * One published run said the reserve "covers the required value, although the
   * margin is negative" — two descriptions of the same fact, asserted against
   * each other. A negative margin IS the reserve failing to cover; there is no
   * state in which both halves hold.
   *
   * The instruction forbids it, but an instruction is a request. This is the
   * refusal: within a single sentence, a claim of coverage alongside the word
   * "negative" is the inversion, whatever the surrounding facts happen to be.
   */
  for (const sentence of whole.split(/(?<=[.!?])\s+/)) {
    if (/pokrywa|pokryje|pokrywaj/i.test(sentence) && /ujemn/i.test(sentence)) {
      return { ok: false, reason: 'zdanie przeczy samo sobie o pokryciu' };
    }
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
