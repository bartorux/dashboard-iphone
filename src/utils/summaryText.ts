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
export const PROMPT_VERSION = 9;

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
„W poniedziałek między 18:00 a 19:00 rezerwa nie pokryje wymaganego poziomu. Nadwyżka
pozostaje jednak powyżej progu, powyżej którego operator ma prawo przywołania
nie ogłaszać."

ZAKAZANE zwroty, bo nic nie wnoszą: „sytuacja bilansowa", „bilans systemowy",
„zasoby DSR", „jednostki DSR", „ciągłość pracy", „profil generacji".
ZAKAZANE kolokwializmy, na przykład „zrobi się ciasno", „na styk".
Nazywaj rzeczy po imieniu: rezerwa mocy, wymagana rezerwa, margines, przywołanie.

ZASADY, bezwzględnie:
- NIE podawaj wielkości mocy ani procentów — ani cyframi, ani słownie. To
  jedyne, co model mógłby przekręcić, a aplikacja pokazuje je obok.
- Cyframi zapisuj wyłącznie godziny w formacie HH:MM występujące w faktach.
- Liczbę godzin możesz podać SŁOWNIE, jeśli wynika z faktów: „przez trzy
  godziny", „tylko w tej jednej godzinie". To bywa najkrótszy sposób
  powiedzenia, jak szeroki jest problem.
- Nie wymyślaj faktów. Pisz wyłącznie o tym, co jest poniżej.
- Nie pisz o teście ani o testowym okresie przywołania — tych danych nie mamy.
- Nie przypisuj operatorowi zamiarów ani przewidywań. Nie wiemy, co planuje.
  Pisz o tym, czy są PODSTAWY do przywołania, nie o tym, co operator zrobi.
- Nie pisz w pierwszej osobie liczby mnogiej.
- Bez dramatyzowania i bez uspokajania na siłę. Bez zdań pustych w rodzaju
  „sytuacja będzie monitorowana".
- NIE POWTARZAJ zasad ogłaszania przywołania. Czytelnik je zna.

NAJWAŻNIEJSZE ROZRÓŻNIENIE, nie odwróć go:
- Margines DODATNI oznacza, że dostępna rezerwa POKRYWA wymagany poziom. Nawet bardzo
  wąski margines nadal go pokrywa.
- Margines UJEMNY oznacza, że rezerwa NIE POKRYWA wymaganego poziomu. To są dwa opisy
  tego samego faktu, nie dwie osobne informacje.
- Nigdy nie pisz, że rezerwa spadła poniżej wymaganej, jeśli margines jest dodatni.
- Nigdy nie pisz, że rezerwa pokrywa wymagany poziom, jeśli margines jest ujemny.
- ZDANIE ZAKAZANE, bo przeczy samo sobie: „rezerwa pokrywa wymaganą wartość,
  choć margines jest ujemny". Jeśli margines jest ujemny, napisz wprost, że
  rezerwa nie pokrywa wymaganego poziomu.

Kontekst: okres przywołania to sytuacja, w której operator sieci wzywa odbiorców
do ograniczenia poboru. Ogłasza go w dzień roboczy między 07:00 a 22:00,
z co najmniej ośmiogodzinnym wyprzedzeniem.

DWIE RÓŻNE WIELKOŚCI — nazywaj je osobno, nigdy obie „progiem":
- WYMAGANA REZERWA — poziom, który rezerwa ma pokryć. Zmienia się co godzinę.
- PRÓG 1100 MW — inna, stała wielkość. Dopóki nadwyżka jest powyżej niego,
  przepis pozwala operatorowi nie ogłaszać przywołania. Nie nazywaj go
  „progiem regulacyjnym" — takiego terminu nie ma.
Rezerwa bywa poniżej wymaganego poziomu i jednocześnie powyżej progu 1100 MW.
To nie jest sprzeczność, to są dwie różne rzeczy.

TRZY STANY — nie zlewaj ich w „ryzyko":
- „OPERATOR MA PRAWO NIE OGŁASZAĆ" znaczy: rezerwa nie pokrywa wymaganego
  poziomu, ale nadwyżka utrzymuje się powyżej progu, więc przepis pozwala
  operatorowi nie ogłaszać przywołania. Pisz właśnie tak: „operator ma prawo nie ogłaszać
  przywołania".
- „PRZYWOŁANIE POWINNO ZOSTAĆ OGŁOSZONE" znaczy: nadwyżka spadła poniżej progu
  1100 MW, więc operator traci podstawę, by przywołania nie ogłaszać. Nie pisz „musi"
  ani „na pewno" — to nie jest gwarancja.
- „brak podstaw" znaczy dokładnie tyle: rezerwa pokrywa wymagany poziom albo godzina
  wypada poza dniem roboczym lub poza godzinami 07:00-22:00.

NIE ŁĄCZ FAKTÓW W ZWIĄZKI PRZYCZYNOWE, których w nich nie ma:
- Nie pisz „więc", „dlatego", „w związku z tym" między faktami, które po prostu
  stoją obok siebie. Wymieniaj je, nie tłumacz jednym drugiego.
- Zwłaszcza: to, że nadwyżka utrzymuje się powyżej progu, jest powodem,
  dla którego operator MA PRAWO nie ogłaszać przywołania. Nigdy nie jest powodem,
  dla którego ogłoszenie miałoby paść.
- To, czy ogłoszenie może jeszcze nadejść, wynika wyłącznie z wymaganych ośmiu
  godzin wyprzedzenia. Nie wiąż tego z wysokością nadwyżki — to osobna sprawa.

UPRAWNIENIE TO NIE PROGNOZA:
- „Operator ma prawo nie ogłaszać" znaczy, że pozwala mu na to przepis. NIE
  znaczy, że przewidujemy, co zrobi — tego nie wiemy.
- Pisz „ma prawo nie ogłaszać" albo „przepis pozwala mu nie ogłaszać". Unikaj
  samego „może", bo czyta się je i jako uprawnienie, i jako przypuszczenie,
  a czytelnik musi wiedzieć, które z nich masz na myśli.

JEDEN SŁOWNIK W CAŁYM TEKŚCIE:
- Nad kartą stoi duża liczba MARGINESU, więc trzymaj się marginesu. Nie mieszaj
  w jednym podsumowaniu „rezerwa nie pokrywa wymaganej" z „ujemny margines" —
  to jest to samo powiedziane dwoma słownikami, a czytelnik musi tłumaczyć.
- Nie zostawiaj przymiotnika bez rzeczownika. „Rezerwa pokryje wymaganą" urywa
  się w połowie; pisz „pokryje wymagany poziom".
- Nie mów o progu 1100 MW „próg regulacyjny" — takiego terminu nie ma i myli
  się z wymaganą rezerwą. Nazwij go przez to, co robi: „próg, powyżej którego
  operator ma prawo nie ogłaszać przywołania".

NIE PRZECIWSTAWIAJ RZECZY, KTÓRE SIĘ NIE KŁÓCĄ:
- „Nie ma podstaw, MIMO że margines jest dodatni" jest odwrotnie: dodatni
  margines jest właśnie powodem, dla którego podstaw nie ma.
- Używaj „choć", „mimo" tylko wtedy, gdy druga część naprawdę osłabia pierwszą.

NIE UŻYWAJ METAFOR ANI SKRÓTÓW MYŚLOWYCH:
- ZAKAZANE: „okno", „okno ogłoszenia", „okno pozostaje otwarte". Czytelnik nie
  wie, co to okno, a wyjaśnienie i tak wypada ze zdania.
- Pisz wprost, o co chodzi: „ogłoszenie może jeszcze nadejść" albo „na ogłoszenie
  jest już za późno".

PISZ, O KTÓRYCH GODZINACH MÓWISZ:
- Jeśli w jednym dniu jedne godziny mają margines ujemny, a inne dodatni, powiedz
  wprost, że to różne godziny. Inaczej dwa prawdziwe zdania obok siebie czytają
  się jak zaprzeczenie.

NARRACJA — to jest informacja, nie ostrzeżenie:
- Nie pisz tak, jakby przywołanie było przesądzone, dopóki fakty tego nie mówią.
  Przy stanie „operator ma prawo nie ogłaszać" najczęściej nic się nie wydarzy.
- Nie strasz i nie dramatyzuj. Nie używaj słów „zagrożenie", „krytyczny",
  „alarmujący", „niebezpieczny".
- Ale też nie pocieszaj na siłę. Jeśli rezerwa nie pokrywa wymaganej, napisz to
  wprost i spokojnie.

FORMAT ODPOWIEDZI — dokładnie trzy linie, każda z etykietą na początku:
NAGŁÓWEK: jedno zdanie, najważniejsza rzecz.
TREŚĆ: dwa albo trzy zdania o tym, co się dzieje i czego się spodziewać.
DALEJ: jedno zdanie o kolejnych dniach.

WZORZEC DLA DALEJ — ta linia łamała zasady najczęściej, bo jako jedyna nie
miała przykładu:
TAK NIE PISZ: „Niedziela i wtorek nie wykażą podstaw do przywołania, mimo
wystąpienia cienkiego dodatniego marginesu w godzinach wieczornych."
(dni niczego nie wykazują; „mimo" przeciwstawia rzeczy, która niczemu nie
przeczy — dodatni margines JEST powodem braku podstaw; „w godzinach
wieczornych" zamiast konkretnej godziny z faktów)
TAK PISZ: „W niedzielę i we wtorek nie ma podstaw do przywołania, choć we
wtorek o 20:00 margines robi się wąski."

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

  const withoutHours = whole.replace(HOUR_PATTERN, '');
  if (/\d/.test(withoutHours)) {
    return { ok: false, reason: 'tekst zawiera liczbę spoza godzin' };
  }

  return { ok: true };
}
