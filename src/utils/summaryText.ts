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
export const PROMPT_VERSION = 17;

/**
 * Written in correct Polish on purpose, diacritics and all. Runs where the
 * instruction was plain ASCII came back stripped of them, and once with an
 * invented escape — a Hungarian ű where ż belonged. The model mirrors the
 * register of its prompt, and the prompt is the bulk of the request.
 */
export const INSTRUCTION = `Na podstawie PONIŻSZYCH FAKTÓW napisz krótkie podsumowanie
stanu rezerw mocy w krajowej sieci elektroenergetycznej.

=== CO OPISUJESZ ===

Okres przywołania to sytuacja, w której operator wzywa odbiorców do ograniczenia
poboru. Ogłasza go w dzień roboczy między 07:00 a 22:00, z co najmniej
ośmiogodzinnym wyprzedzeniem. Nie powtarzaj tych zasad w tekście — czytelnik je zna.

TRZY WIELKOŚCI, każda nazywana inaczej. Nigdy nie mów o dwóch z nich „próg":
- MARGINES — dostępna rezerwa minus wymagany poziom. Tego słowa trzymaj się
  w całym tekście, bo tę wartość czytelnik widzi u góry karty.
- WYMAGANY POZIOM — ile rezerwy trzeba. Zmienia się co godzinę.
- NADWYŻKA i PRÓG 1100 MW — osobna para. Dopóki nadwyżka przekracza próg,
  przepis pozwala operatorowi nie ogłaszać przywołania. Nie nazywaj tego progu
  „regulacyjnym" — takiego terminu nie ma. Jeśli musisz go opisać, napisz
  „próg 1100 MW" i dodaj osobnym zdaniem, co z niego wynika — nie doklejaj
  wyjaśnienia zdaniem względnym, bo powstaje z tego „powyżej progu, powyżej
  którego…".

Rezerwa bywa poniżej wymaganego poziomu i jednocześnie powyżej progu 1100 MW.
To nie sprzeczność, tylko dwie różne rzeczy.

MARGINES A POKRYCIE — nie odwróć tego:
- Margines DODATNI = rezerwa POKRYWA wymagany poziom. Nawet bardzo wąski nadal
  go pokrywa.
- Margines UJEMNY = rezerwa NIE POKRYWA wymaganego poziomu.
To dwa opisy jednego faktu, nie dwie informacje. Zdanie zakazane, bo przeczy
samo sobie: „rezerwa pokrywa wymaganą wartość, choć margines jest ujemny".

TRZY STANY — nie sprowadzaj ich do jednego „ryzyka":
- „OPERATOR MA PRAWO NIE OGŁASZAĆ PRZYWOŁANIA" — rezerwa nie pokrywa wymaganego
  poziomu, ale nadwyżka trzyma się powyżej progu. To UPRAWNIENIE z przepisu, nie
  zapowiedź. Pisz „ma prawo nie ogłaszać przywołania" albo „przepis pozwala mu
  nie ogłaszać przywołania" — unikaj samego „może", bo znaczy i jedno, i drugie.
- „PRZYWOŁANIE POWINNO ZOSTAĆ OGŁOSZONE" — nadwyżka spadła poniżej progu, więc
  operator traci tę podstawę. Nie pisz „musi" ani „na pewno".
- „nie ma podstaw do przywołania" — rezerwa pokrywa wymagany poziom albo godzina
  przypada poza dniem roboczym lub poza godzinami 07:00-22:00.

=== JAK PISZESZ ===

Jak dyżurny inżynier, który mówi koledze, czego się spodziewać — zawodowo, ale
bez urzędowego żargonu. Odbiorcy pracują w energetyce.

- CZASOWNIKI zamiast rzeczowników odczasownikowych: „rezerwa spadnie", nie
  „nastąpi spadek rezerwy"; „nie pokryje", nie „wystąpi brak pokrycia".
- KONKRETNE GODZINY, kiedy fakty je podają: „między 18:00 a 19:00".
- PEŁNE ZDANIA. Nazwy stanów w faktach to skróty z listy — w zdaniu potrzebują
  orzeczenia. Nie zostawiaj też przymiotnika bez rzeczownika.
- JEDNO ZDANIE, JEDNA MYŚL. Zastrzeżenie dodawaj tylko wtedy, gdy zmienia wniosek.
- POWIEDZ, O KTÓRYCH GODZINACH MÓWISZ. Jeśli w jednym dniu jedne godziny mają
  margines ujemny, a inne dodatni, nazwij to wprost — inaczej dwa prawdziwe
  zdania obok siebie czytają się jak zaprzeczenie.
- NIE POWTARZAJ TEGO SAMEGO SŁOWA w jednym zdaniu, jeśli da się inaczej.
  „powyżej progu, powyżej którego" brzmi jak potknięcie — rozbij na dwa zdania
  albo przeformułuj.
- NIE POTWIERDZAJ BRAKU WIADOMOŚCI. Skoro nagłówek podaje godziny, w których
  coś się dzieje, czytelnik wie, że w pozostałych nic się nie dzieje. Zdanie
  „w innych godzinach rezerwa pokrywa wymagany poziom" zajmuje miejsce i nic
  nie wnosi.
- Poprawna polszczyzna, z polskimi znakami.

TAK NIE PISZ (asekuracko, bez konkretu):
„W poniedziałek w wyznaczonym przedziale czasowym rezerwa nie pokrywa w pełni
wymaganej wielkości, w związku z czym występuje ryzyko wezwania odbiorców."

TAK PISZ (wprost, z godzinami, czasownikami):
„W poniedziałek między 18:00 a 19:00 rezerwa nie pokryje wymaganego poziomu.
Nadwyżka wciąż przekracza próg 1100 MW, więc operator ma prawo nie ogłaszać
przywołania."

=== CZEGO NIE ROBISZ ===

LICZBY:
- Żadnych wielkości mocy ani procentów — ani cyframi, ani słownie. To jedyne,
  co mógłbyś przeinaczyć, a aplikacja pokazuje te wartości obok.
- JEDYNY WYJĄTEK: wolno napisać „próg 1100 MW". To stała z przepisu, nie odczyt
  z prognozy. Żadnej innej wartości w megawatach nie podawaj.
- Cyframi zapisuj wyłącznie godziny HH:MM występujące w faktach.
- Liczbę godzin możesz podać słownie: „przez trzy godziny", „tylko w tej jednej
  godzinie". Tak najkrócej powiesz, ilu godzin dotyczy rzecz.

ZAKAZANE SŁOWA I ZWROTY:
- pusta wata: „w pełni", „również", „ponadto", „w chwili obecnej", „należy zauważyć"
- żargon: „sytuacja bilansowa", „bilans systemowy", „zasoby DSR", „jednostki DSR",
  „ciągłość pracy", „profil generacji"
- kolokwializmy: „zrobi się ciasno", „na styk"
- straszenie: „zagrożenie", „krytyczny", „alarmujący", „niebezpieczny"
- mgliste pory: „w godzinach wieczornych", „w wyznaczonym przedziale czasowym"
- metafora okna: „okno", „okno ogłoszenia", „okno pozostaje otwarte" — czytelnik
  nie wie, co to okno. Pisz „ogłoszenie może jeszcze nadejść" albo „na ogłoszenie
  jest już za późno".
- puste zdania: „sytuacja będzie monitorowana"
- pierwsza osoba liczby mnogiej

FAŁSZYWE ZWIĄZKI:
- Nie łącz słowami „więc", „dlatego", „w związku z tym" faktów, które tylko stoją
  obok siebie. Zwłaszcza: nadwyżka powyżej progu jest powodem, dla którego
  operator MA PRAWO NIE OGŁASZAĆ przywołania — nigdy powodem, dla którego
  ogłoszenie miałoby paść.
- To, czy ogłoszenie może jeszcze nadejść, zależy wyłącznie od tego, czy zostało
  wymagane ośmiogodzinne wyprzedzenie. Nie wiąż tego z wysokością nadwyżki.
- „choć" i „mimo" tylko wtedy, gdy druga część naprawdę osłabia pierwszą.
  „Nie ma podstaw, MIMO że margines dodatni" odwraca zależność — dodatni margines
  jest właśnie powodem braku podstaw.

TREŚĆ:
- Nie wymyślaj faktów. Pisz wyłącznie o tym, co jest poniżej.
- Nie pisz o teście ani o testowym okresie przywołania — tych danych nie ma.
- Nie przypisuj operatorowi zamiarów. Nie wiadomo, co zrobi; pisz o PODSTAWACH.
- Nie zapowiadaj przywołania, dopóki fakty tego nie mówią. Ale też nie pocieszaj
  na siłę: jeśli rezerwa nie pokrywa wymaganego poziomu, napisz to wprost
  i spokojnie. To jest informacja, nie ostrzeżenie.

=== FORMAT ODPOWIEDZI ===

Dokładnie trzy wiersze, każdy z etykietą na początku. Żadnego JSON-a, żadnych
cudzysłowów wokół pól, żadnych sekwencji ucieczki.

NAGŁÓWEK: jedno zdanie, najważniejsze ustalenie.
TREŚĆ: DWA zdania. Każde ma nieść coś, czego nie ma w nagłówku — najczęściej
dlaczego operator ma prawo nie ogłaszać przywołania i czy ogłoszenie może
jeszcze nadejść.
DALEJ: jedno zdanie o kolejnych dniach.

WZORZEC DLA DALEJ — ten wiersz łamał zasady najczęściej:
TAK NIE PISZ: „Niedziela i wtorek nie wykażą podstaw do przywołania, mimo
wystąpienia cienkiego dodatniego marginesu w godzinach wieczornych."
(dni niczego nie wykazują; „mimo" przeciwstawia dwie rzeczy, które sobie nie
przeczą; „cienki margines" to kalka — margines jest wąski; „w godzinach
wieczornych" zamiast godziny z faktów)
TAK PISZ: „W niedzielę i we wtorek nie ma podstaw do przywołania; we wtorek
o 20:00 margines jest najwęższy."

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
  'Zacznij od najbliższych godzin.',
  'Zacznij od najtrudniejszej godziny w całym horyzoncie.',
  'Zacznij od tego, czy sytuacja jest typowa na tle ostatnich dni.',
  'Zacznij od dnia, który wymaga najwięcej uwagi, choćby był ostatni.',
  'Zacznij od tego, czy w ogóle są podstawy do przywołania.',
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
    `\n\nTYM RAZEM ZACZNIJ OD: ${emphasisFor(now)}`
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

  /*
   * Told not to use digits, one run simply spelled the figure out instead — so
   * the ban covers words too. The one exception is the 1100 MW threshold, which
   * is a fixed figure from the regulation rather than a reading of the current
   * hour: it cannot be wrong about the situation, and both the facts and this
   * instruction hand it to the model repeatedly. Forbidding it meant the input
   * demonstrated the very thing the output was refused for, and every answer was
   * rejected.
   */
  const bezStalej = whole.replace(/\b1100\s*MW\b/gi, '');
  if (/megawat|MW\b|procent/i.test(bezStalej)) {
    return { ok: false, reason: 'tekst podaje wielkość mocy' };
  }


  /*
   * Vague times, banned in the instruction and used anyway. The facts always
   * carry the hour, so reaching for "in the evening hours" throws away the one
   * thing the reader came for — and it is the phrase the instruction names as
   * forbidden, which makes it the clearest case for a refusal rather than a
   * request.
   */
  if (
    /w godzinach (wieczorn|porann|popo|nocn)\w*|w wyznaczonym przedziale|w godzinach szczytu/i.test(
      whole
    )
  ) {
    return { ok: false, reason: 'mgliste określenie pory zamiast godziny' };
  }

  // A calque of "thin margin"; in Polish a margin is narrow, never thin. It
  // came from my own wording of the facts and was copied three runs running.
  if (/cienk\w*\s+(margines|marginesem|marginesu)/i.test(whole)) {
    return { ok: false, reason: 'kalka „cienki margines" zamiast „wąski"' };
  }

  /*
   * "The window stays open" reached a published summary. It came from my own
   * wording of the facts, shortened by the model until the only clause
   * explaining what the window was had fallen away — and the person who had to
   * ask what it meant knows this domain professionally.
   *
   * The facts now say it plainly instead, and this refuses the metaphor if it
   * comes back.
   */
  if (/\bokn[oaie]\w*\b/i.test(whole)) {
    return { ok: false, reason: 'tekst używa metafory okna zamiast wprost' };
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
    if (!/ujemn/i.test(sentence)) continue;

    // Negated coverage is the correct pairing, not the contradiction: "the
    // margin is negative, so the reserve does NOT cover what is required" says
    // one thing twice, which is exactly what the instruction asks for. Checking
    // for the words alone rejected that sentence — and the instruction demands
    // it — so every run was refused and the text sat frozen.
    const affirmative = sentence.replace(
      /\bnie\s+(pokrywa|pokryje|pokrywaj\w*|pokryw\w*)/gi,
      ''
    );

    if (/\b(pokrywa|pokryje|pokrywaj)\w*/i.test(affirmative)) {
      return { ok: false, reason: 'zdanie przeczy samo sobie o pokryciu' };
    }
  }

  for (const hour of whole.match(HOUR_PATTERN) ?? []) {
    if (!allowedHours.has(hour)) {
      return { ok: false, reason: `godzina ${hour} spoza faktów` };
    }
  }

  const withoutHours = whole
    .replace(/\b1100\s*MW\b/gi, '')
    .replace(HOUR_PATTERN, '');
  if (/\d/.test(withoutHours)) {
    return { ok: false, reason: 'tekst zawiera liczbę spoza godzin' };
  }

  return { ok: true };
}
