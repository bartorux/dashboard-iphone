import { DayFacts, leadingDay, renderFacts } from './summaryFacts';

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
export const PROMPT_VERSION = 44;

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
Nazywaj to zawsze „przywołaniem" — jedna nazwa na jedną rzecz.

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

TRZY STANY — nie sprowadzaj ich do jednego „ryzyka". W dwóch pierwszych operator
MOŻE ogłosić przywołanie; różni je wyłącznie to, czy ma wybór, czy już go stracił.
Czytają to energetycy zakładowi, nie specjaliści od rynku mocy. Pisz o tym, co
ich dotyczy — czy w danej dobie może dojść do przywołania — a nie o podstawach
prawnych. Nadwyżka i próg 1100 MW to liczby, nie instytucje prawne.
- rezerwa nie pokrywa wymaganego poziomu, ale nadwyżka trzyma się powyżej
  1100 MW — operator MOŻE OGŁOSIĆ PRZYWOŁANIE, ALE NIE MUSI. Co zrobi, nie
  wiadomo, więc tego nie przesądzaj.
- nadwyżka spadła poniżej 1100 MW — operator MOŻE OGŁOSIĆ PRZYWOŁANIE, a spadła
  poniżej poziomu, który pozwalał mu je pominąć. NIE pisz, że przywołanie
  „powinno zostać ogłoszone", „zostanie ogłoszone" ani że jest „spodziewane":
  bywały doby poniżej progu bez żadnego ogłoszenia, a decyzji operatora nikt tu
  nie zna. Nie pisz też, że przepis „nie pozwala pominąć" — to znaczyłoby, że
  nakazuje ogłosić, a nie nakazuje.
- „nic nie zapowiada przywołania" — rezerwa pokrywa wymagany poziom albo godzina
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
  albo przeformułuj. To samo dotyczy zdań sąsiadujących: dwa pod rząd nie mogą
  wisieć na tym samym „więc", „dlatego" ani „w związku z tym".
- NIE POTWIERDZAJ BRAKU WIADOMOŚCI. Skoro nagłówek podaje godziny, w których
  coś się dzieje, czytelnik wie, że w pozostałych nic się nie dzieje. Zdanie
  „w innych godzinach rezerwa pokrywa wymagany poziom" zajmuje miejsce i nic
  nie wnosi.
- Poprawna polszczyzna, z polskimi znakami.

TAK NIE PISZ (asekuracko, bez konkretu):
„W poniedziałek w wyznaczonym przedziale czasowym rezerwa nie pokrywa w pełni
wymaganej wielkości, w związku z czym występuje ryzyko ogłoszenia przywołania."

TAK PISZ — to jest UKŁAD, nie zdanie do przepisania. Wypełnij go od nowa:
  PIERWSZE ZDANIE: kiedy (dzień z faktów i konkretne godziny) oraz co stanie się
    z rezerwą, powiedziane czasownikiem — „spadnie", nie „nastąpi spadek".
  DRUGIE ZDANIE: co z tego wynika dla uprawnienia operatora.
Dwa zdania z rzędu nie mogą wisieć na tym samym spójniku, więc nie zaczynaj
drugiego od „więc", jeśli pierwsze już na nim stało.

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
- mgliste pory: „w godzinach wieczornych", „w wyznaczonym przedziale czasowym",
  a także same przysłówki — „wieczorem", „rano", „po południu", „nocą". Skoro
  fakty podają godzinę, podaj godzinę; dotyczy to zwłaszcza nagłówka.
- metafora okna: „okno", „okno ogłoszenia", „okno pozostaje otwarte" — czytelnik
  nie wie, co to okno. Pisz „ogłoszenie może jeszcze nadejść" albo „na ogłoszenie
  jest już za późno".
- puste zdania: „sytuacja będzie monitorowana"
- pierwsza osoba liczby mnogiej

FAŁSZYWE ZWIĄZKI:
- Nie łącz słowami „więc", „dlatego", „w związku z tym" faktów, które tylko stoją
  obok siebie. Zwłaszcza: nadwyżka powyżej progu jest powodem, dla którego
  operator MOŻE PRZYWOŁANIA NIE OGŁASZAĆ — nigdy powodem, dla którego
  ogłoszenie miałoby paść.
- To, czy ogłoszenie może jeszcze nadejść, zależy wyłącznie od tego, czy zostało
  wymagane ośmiogodzinne wyprzedzenie. Nie wiąż tego z wysokością nadwyżki.
- „choć" i „mimo" tylko wtedy, gdy druga część naprawdę osłabia pierwszą.
  „Nic nie zapowiada przywołania, MIMO że margines dodatni" odwraca zależność —
  dodatni margines jest właśnie powodem, że nic go nie zapowiada.

TREŚĆ:
- Nie wymyślaj faktów. Pisz wyłącznie o tym, co jest poniżej.
- Nie stopniuj tego, czego fakty nie stopniują. O czynniku wiadomo tylko, czy
  wypadł poza swoje typowe pasmo, a o prognozie — czy się przesuwa. NIE o ile.
  Napisz, że coś jest poniżej albo powyżej normy, bez określania jak bardzo.
- Nie pisz o teście ani o testowym okresie przywołania — tych danych nie ma.
- Nie przypisuj operatorowi zamiarów. Nie wiadomo, co zrobi; pisz o TYM, CO
  POKAZUJĄ LICZBY.
- Nie zapowiadaj przywołania, dopóki fakty tego nie mówią. Ale też nie pocieszaj
  na siłę: jeśli rezerwa nie pokrywa wymaganego poziomu, napisz to wprost
  i spokojnie. To jest informacja, nie ostrzeżenie.

=== FORMAT ODPOWIEDZI ===

Dokładnie trzy wiersze, każdy z etykietą na początku. Żadnego JSON-a, żadnych
cudzysłowów wokół pól, żadnych sekwencji ucieczki.

NAGŁÓWEK: jedno zdanie, najważniejsze ustalenie.
TREŚĆ: DWA zdania, każde z osobnym zadaniem.
  PIERWSZE — to, co fakty podają o wskazanej godzinie: albo że prognoza tej doby
    się pogarsza lub poprawia, albo dlaczego akurat ta godzina jest
    najciaśniejsza. Fakty podadzą JEDNO z dwóch, nigdy oba naraz.
  DRUGIE — czy ogłoszenie może jeszcze nadejść.
NIE powtarzaj tu stanu prawnego: nagłówek już powiedział, czy operator ma prawo
nie ogłaszać przywołania, a drugi raz w tym samym tekście to zdanie nic nie wnosi.
- Powód opisz SŁOWAMI z faktów („wiatr poniżej normy"), bez liczb i bez
  przeliczania. Nie zgaduj przyczyny, której w faktach nie ma — pogoda, awarie
  i remonty to domysły, dopóki fakty ich nie nazywają.
- DZIEŃ nazywaj DOKŁADNIE tak, jak nazywają go fakty. Jeśli piszą „poniedziałek
  17 sierpnia", nie skracaj do „w poniedziałek": okno sięga za weekend, więc sama
  nazwa dnia tygodnia opisuje wtedy dwa różne dni, a czytelnik wybierze bliższy.
- ZAWSZE w liczbie POJEDYNCZEJ, także gdy wymieniasz kilka dni: „w środę i piątek",
  nigdy „w środy i piątki". Liczba mnoga znaczy „w każdą środę" — nawyk, nie dzień.
DALEJ: jedno zdanie o kolejnych dniach. NIE WYLICZAJ WSZYSTKICH — fakty obejmują
kilka dni i wyliczanka zajęłaby całe zdanie, nie mówiąc niczego. Nazwij dni,
w których przywołanie WCHODZI W GRĘ albo margines jest wąski, a resztę zbierz
jednym stwierdzeniem: „w pozostałych dniach nic go nie zapowiada". Jeśli takiego dnia nie ma
ani jednego, powiedz to wprost o całym okresie i na tym poprzestań.

WZORZEC DLA DALEJ — ten wiersz łamał zasady najczęściej:
TAK NIE PISZ: „Niedziela i wtorek nie wykażą przywołania, mimo
wystąpienia cienkiego dodatniego marginesu w godzinach wieczornych."
(dni niczego nie wykazują; „mimo" przeciwstawia dwie rzeczy, które sobie nie
przeczą; „cienki margines" to kalka — margines jest wąski; „w godzinach
wieczornych" zamiast godziny z faktów)
TAK NIE PISZ: „We wtorek nic nie zapowiada przywołania, w środę nic nie
zapowiada przywołania, w czwartek też nie, a w piątek margines jest wąski." (wyliczanka; trzy pierwsze człony
niosą jedną informację)
TAK PISZ — układ: nazwij dzień i godziny, w których coś jest, a resztę zbierz
jednym stwierdzeniem. Gdy nie dzieje się nic w żadnym dniu, powiedz to o całym
okresie i na tym poprzestań. Za każdym razem własnymi słowami.

FAKTY:
`;

/**
 * Swap a fragment of the instruction, loudly.
 *
 * The variants below are substrings of INSTRUCTION kept in step by hand, so a
 * reworded instruction silently stops matching and every run quietly falls back
 * to the default shape. That exact failure — a replacement that matched nothing
 * and reported success — cost an afternoon today in a different file. A throw
 * here fails the scheduled job, which leaves the previous summary published and
 * raises a warning; a silent miss would publish the wrong shape instead.
 */
export function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) {
    throw new Error(
      'Fragment instrukcji nie pasuje — zmieniono INSTRUCTION bez aktualizacji wariantu formatu'
    );
  }
  return text.replace(from, to);
}

/** The three-line format, as the instruction states it. */
const FORMAT_WITH_BODY = `Dokładnie trzy wiersze, każdy z etykietą na początku. Żadnego JSON-a, żadnych
cudzysłowów wokół pól, żadnych sekwencji ucieczki.

NAGŁÓWEK: jedno zdanie, najważniejsze ustalenie.
TREŚĆ: DWA zdania, każde z osobnym zadaniem.
  PIERWSZE — to, co fakty podają o wskazanej godzinie: albo że prognoza tej doby
    się pogarsza lub poprawia, albo dlaczego akurat ta godzina jest
    najciaśniejsza. Fakty podadzą JEDNO z dwóch, nigdy oba naraz.
  DRUGIE — czy ogłoszenie może jeszcze nadejść.
NIE powtarzaj tu stanu prawnego: nagłówek już powiedział, czy operator ma prawo
nie ogłaszać przywołania, a drugi raz w tym samym tekście to zdanie nic nie wnosi.
- Powód opisz SŁOWAMI z faktów („wiatr poniżej normy"), bez liczb i bez
  przeliczania. Nie zgaduj przyczyny, której w faktach nie ma — pogoda, awarie
  i remonty to domysły, dopóki fakty ich nie nazywają.
- DZIEŃ nazywaj DOKŁADNIE tak, jak nazywają go fakty. Jeśli piszą „poniedziałek
  17 sierpnia", nie skracaj do „w poniedziałek": okno sięga za weekend, więc sama
  nazwa dnia tygodnia opisuje wtedy dwa różne dni, a czytelnik wybierze bliższy.
- ZAWSZE w liczbie POJEDYNCZEJ, także gdy wymieniasz kilka dni: „w środę i piątek",
  nigdy „w środy i piątki". Liczba mnoga znaczy „w każdą środę" — nawyk, nie dzień.`;

/**
 * The block describing DALEJ, lifted out so the answer-first shape can drop it.
 *
 * Kept byte-identical to the passage inside INSTRUCTION; `swap` throws if the
 * two ever drift apart.
 */
const DALEJ_BLOCK = `DALEJ: jedno zdanie o kolejnych dniach. NIE WYLICZAJ WSZYSTKICH — fakty obejmują
kilka dni i wyliczanka zajęłaby całe zdanie, nie mówiąc niczego. Nazwij dni,
w których przywołanie WCHODZI W GRĘ albo margines jest wąski, a resztę zbierz
jednym stwierdzeniem: „w pozostałych dniach nic go nie zapowiada". Jeśli takiego dnia nie ma
ani jednego, powiedz to wprost o całym okresie i na tym poprzestań.

WZORZEC DLA DALEJ — ten wiersz łamał zasady najczęściej:
TAK NIE PISZ: „Niedziela i wtorek nie wykażą przywołania, mimo
wystąpienia cienkiego dodatniego marginesu w godzinach wieczornych."
(dni niczego nie wykazują; „mimo" przeciwstawia dwie rzeczy, które sobie nie
przeczą; „cienki margines" to kalka — margines jest wąski; „w godzinach
wieczornych" zamiast godziny z faktów)
TAK NIE PISZ: „We wtorek nic nie zapowiada przywołania, w środę nic nie
zapowiada przywołania, w czwartek też nie, a w piątek margines jest wąski." (wyliczanka; trzy pierwsze człony
niosą jedną informację)
TAK PISZ — układ: nazwij dzień i godziny, w których coś jest, a resztę zbierz
jednym stwierdzeniem. Gdy nie dzieje się nic w żadnym dniu, powiedz to o całym
okresie i na tym poprzestań. Za każdym razem własnymi słowami.
`;

/**
 * Answer first, detail second — the shape for a calm window that has a cause.
 *
 * The arrangement it replaces produced a see-saw. Forbidden from stating the
 * calm verdict, the headline reached for "rezerwa spada najniżej w całym
 * okresie", which reads as bad news; the body then took it back twice, once
 * with a counterweight and once with the 30-day standing; and DALEJ closed with
 * the verdict the headline had not been allowed to give. Two beats of worry,
 * three of reassurance, all of equal weight — perfectly balanced and therefore
 * saying nothing.
 *
 * The reader opens this app with one question. The first line answers it, and
 * it is the line that stays visible when the card is collapsed. Everything else
 * is detail, subordinate rather than opposed.
 */
const FORMAT_ANSWER_FIRST = `Dokładnie DWA wiersze, każdy z etykietą na początku. Żadnego JSON-a, żadnych
cudzysłowów wokół pól, żadnych sekwencji ucieczki. Wiersza DALEJ tym razem NIE MA.

NAGŁÓWEK: jedno zdanie, wprost — w tych dniach nic nie zapowiada przywołania.
To jest odpowiedź na pytanie, z którym czytelnik otwiera aplikację, i jedyne
zdanie widoczne, gdy karta jest zwinięta. NIE zaczynaj od tego, co najciaśniejsze
— to należy do TREŚCI.
TREŚĆ: JEDNO zdanie o godzinie, która wypada najciaśniej: kiedy, co ją zacieśnia
i jak wypada na tle tej samej pory z ostatnich dni. Jeśli fakty podają, że
prognoza tej doby się pogarsza albo poprawia, to ma pierwszeństwo przed
porównaniem — wyprzedza ogłoszenie, a porównanie tylko opisuje stan. Dzień nazwij DOKŁADNIE tak,
jak nazywają go fakty — nie skracaj „poniedziałek 17 sierpnia" do „w poniedziałek",
bo okno sięga za weekend i sama nazwa dnia opisuje wtedy dwa różne dni.
Porównanie ma być członem podrzędnym — „ale i ta godzina mieści się w tym, co
o tej porze typowe" — a nie osobnym zdaniem. Nie dokładaj żadnego dalszego
zastrzeżenia: nagłówek już powiedział, że nic nie grozi.
- Powód opisz SŁOWAMI z faktów („wiatr poniżej normy"), bez liczb. Nie zgaduj
  przyczyny, której w faktach nie ma — pogoda, awarie i remonty to domysły,
  dopóki fakty ich nie nazywają.`;

/**
 * The two-line format, used when no day has grounds and nothing explains the
 * tightest hour either.
 *
 * There is no TREŚĆ here at all. Asking for it and then telling the model what
 * not to put in it failed three times running.
 *
 * The justification below has to match what the switch actually tests. It used
 * to claim there was no narrow margin either, while `hasSomethingToExplain`
 * looked only at grounds — so on a day with a narrow but positive margin the
 * model was handed a sentence its own facts contradicted three paragraphs later.
 */
const FORMAT_WITHOUT_BODY = `Dokładnie DWA wiersze, każdy z etykietą na początku. Żadnego JSON-a, żadnych
cudzysłowów wokół pól, żadnych sekwencji ucieczki. Wiersza TREŚĆ tym razem NIE
MA — w żadnym dniu nic nie zapowiada przywołania, a fakty nie podają powodu,
dla którego któraś godzina byłaby najciaśniejsza, więc nie ma czego rozwijać.

NAGŁÓWEK: jedno zdanie o tym, co w tym okresie jest najciaśniejsze albo jak
wypada on na tle ostatnich dni. NIE powtarzaj tu, że nic nie zapowiada — to należy
do DALEJ.`;

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
  'Zacznij od najtrudniejszej godziny ze wszystkich dni.',
  'Zacznij od tego, czy sytuacja jest typowa na tle ostatnich dni.',
  'Zacznij od dnia, który wymaga najwięcej uwagi, choćby był ostatni.',
  'Zacznij od tego, czy przywołanie w ogóle wchodzi w grę.',
] as const;

export function emphasisFor(now: Date): string {
  return EMPHASES[now.getUTCHours() % EMPHASES.length];
}

/**
 * Whether any day carries something that needs a sentence of its own.
 *
 * Grounds for a call period, and nothing less. A narrow but positive margin was
 * included at first and that was too generous: it is a single fact, the headline
 * takes it, and TREŚĆ was left with the verdict again — published as "W środę
 * o 20:00 margines jest wąski" in the headline and "W środę o 20:00 margines
 * pozostaje dodatni" underneath, the same hour twice and the verdict twice.
 *
 * Grounds are different. They come with a reason the operator may refrain and
 * with whether the notice period still holds — two things the headline cannot
 * carry alone, which is exactly what the middle line is for.
 *
 * A cause qualifies for the same reason, and is not the narrow margin all over
 * again. The narrow margin was one fact the headline had already taken; the mix
 * behind the hour — what pulls the reserve down and what holds it up — is
 * material the headline never touches, and it is the only thing there is to say
 * on the weeks when nothing is happening at all. Those are most weeks.
 */
/** Any day where the regulation has something to say — the three-line case. */
export function hasGrounds(facts: DayFacts[]): boolean {
  return facts.some((day) => day.risk !== 'none');
}

export function hasSomethingToExplain(facts: DayFacts[]): boolean {
  if (hasGrounds(facts)) return true;

  const lead = leadingDay(facts);
  // Movement counts for the same reason a cause does, and rather more: a calm
  // day whose forecast is sliding is the one case where the card can say
  // something before the margin itself has anything to show.
  return lead?.drivers != null || lead?.movement != null;
}

export function buildPrompt(
  facts: DayFacts[],
  historyDays: number,
  now: Date
): string {
  /*
   * The middle line is asked for only when there is something to put in it.
   *
   * Three instructions in a row tried to stop the model repeating the verdict
   * across TREŚĆ and DALEJ, and each one moved the problem instead of solving
   * it: forbidden in the second sentence it went to the first, and with the
   * second sentence removed it took the first outright while the hour it should
   * have carried migrated into the headline. That is not disobedience. When
   * nothing is happening the verdict is the only salient fact and the format
   * offered three slots to hold it.
   *
   * So the slot is gone rather than guarded. The model cannot repeat a line it
   * was never asked to write.
   *
   * Three shapes rather than two, because reopening the slot for a cause brought
   * the repetition straight back: given a middle line and no assignment for it
   * beyond "carry something new", the model wrote the verdict there and skipped
   * the cause entirely. A slot with one job cannot be filled with the other
   * thing.
   */
  const instruction = !hasSomethingToExplain(facts)
    ? swap(INSTRUCTION, FORMAT_WITH_BODY, FORMAT_WITHOUT_BODY)
    : hasGrounds(facts)
      ? INSTRUCTION
      : // Answer first: the format goes, and so does the DALEJ block, or the
        // model is still being told how to write a line it must not write.
        swap(
          swap(INSTRUCTION, FORMAT_WITH_BODY, FORMAT_ANSWER_FIRST),
          DALEJ_BLOCK,
          ''
        );

  return (
    instruction +
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

  /*
   * Either TREŚĆ or DALEJ may be absent, but never both.
   *
   * Which one goes depends on the shape asked for: a quiet period with nothing
   * to explain drops TREŚĆ, and a quiet period WITH a cause drops DALEJ instead,
   * because there the verdict belongs in the headline and DALEJ could only
   * repeat it. What must always hold is a headline plus at least one line under
   * it — a card with nothing but its own answer would be thinner than the two
   * fields suggest.
   */
  const hasDetail = Boolean(summary.body || summary.outlook);
  return summary.headline && hasDetail ? summary : null;
}

/**
 * Generous, but enough to catch a runaway answer.
 *
 * Measured across seventy texts: headline runs to 179 characters at most against
 * a limit of 200, body to 311 against 500 — and outlook to 242 against 200. Only
 * one of the three was ever actually binding, and it was binding on ordinary
 * sentences rather than on runaways: a published answer was refused at 201
 * characters, one over, and the card sat an hour with the previous text.
 *
 * The state names grew when they stopped predicting the operator's decision, and
 * DALEJ quotes them for every day it lists, so a sentence naming two days now
 * clears 200 without being wrong or wordy. Three hundred keeps the headroom the
 * other two fields have and still catches an answer that has genuinely run away,
 * which is a matter of several hundred characters, not one.
 */
const LIMITS: Record<keyof Summary, number> = {
  headline: 200,
  body: 500,
  outlook: 300,
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
  allowedHours: Set<string>,
  /**
   * Day names exactly as the facts spelled them, e.g. "poniedziałek 17 sierpnia".
   *
   * Needed because those are the only place a digit may legitimately appear
   * outside an hour, and only in the form we supplied.
   */
  allowedDayNames: string[] = []
): { ok: true } | { ok: false; reason: string } {
  for (const [key, limit] of Object.entries(LIMITS) as Array<
    [keyof Summary, number]
  >) {
    const value = summary[key];
    /*
     * body and outlook may each be absent, depending on the shape asked for —
     * see parseSummary for which goes when. The headline never may, and the two
     * of them may not both be empty; that pair of rules is checked below rather
     * than field by field.
     */
    if (!value.trim()) {
      if (key !== 'headline') continue;
      return { ok: false, reason: `puste pole ${key}` };
    }
    if (value.length > limit) {
      return { ok: false, reason: `pole ${key} dłuższe niż ${limit} znaków` };
    }
  }

  // A headline on its own is not a summary. One of the two lines beneath it has
  // to carry something, whichever shape was asked for.
  if (!summary.body.trim() && !summary.outlook.trim()) {
    return { ok: false, reason: 'sam nagłówek, bez treści i bez dalszej części' };
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

  /*
   * An hour with no day attached is read as today's, and usually is not.
   *
   * Published on the first run of the cause layer: "O 20:00 wiatr spada poniżej
   * normy…", on a Tuesday, about Thursday. The day tabs sit directly beneath the
   * card, so an unqualified hour points the reader at the wrong one — and the
   * card exists to answer a question about timing.
   *
   * Only the body is checked. The headline names the day when it has one to
   * name, and the outlook speaks about the days collectively.
   */
  const DAY_WORD =
    /poniedział|wtor|środ|czwart|piąt|sobot|niedziel|dziś|dzisiaj|jutro/i;
  /*
   * The headline counts. It sits directly above and is read first, so a day
   * named there covers the hours below it.
   *
   * Checked against the body alone, this refused two of nineteen runs whose
   * headline opened "W poniedziałek 17 sierpnia…" and whose body then said
   * "Między 19:00 a 20:00…" — clear to any reader, and thrown away. Every
   * refusal costs an hour of stale text on the card, so a rule that fires on
   * correct writing is worse than no rule.
   */
  const dayNamed =
    DAY_WORD.test(summary.headline) || DAY_WORD.test(summary.body);
  if (/\d{1,2}:\d{2}/.test(summary.body) && !dayNamed) {
    return { ok: false, reason: 'godzina bez nazwy dnia' };
  }

  /*
   * A weekday in the plural means a habit, not a day.
   *
   * Published once in sixty-one texts: "W środy, piątki i poniedziałek
   * 17 sierpnia margines jest wąski" — which reads as every Wednesday and every
   * Friday, while the window holds exactly one of each. The facts name days in
   * the singular; listing several in one clause is what pulls the model into the
   * distributive form.
   *
   * Anchored on the preposition on purpose. Bare "środy" and "soboty" are also
   * the genitive singular — "do środy" is correct Polish — and only "w środy"
   * is unambiguously the plural.
   */
  if (
    /\bwe?\s+(poniedziałki|wtorki|środy|czwartki|piątki|soboty|niedziele)\b/i.test(
      whole
    )
  ) {
    return { ok: false, reason: 'dzień tygodnia w liczbie mnogiej' };
  }

  /*
   * "Dodatkowy" is "extra"; the word wanted is "dodatni", positive.
   *
   * Published once in seventy-two texts: "margines jest wąski, ale dodatkowy".
   * The next run said "dodatni" and got it right, so it is a slip rather than a
   * habit — but it corrupts the one distinction this whole card rests on, and a
   * reader who knows the domain reads it as a different quantity entirely.
   *
   * Notable as the first fault in this series traced to the model rather than to
   * our own wording: the prompt says "dodatni" six times and "dodatkow" never.
   * The vocabulary here is fixed and this word has no place in it.
   */
  if (/dodatkow/i.test(whole)) {
    return { ok: false, reason: '„dodatkowy" zamiast „dodatni"' };
  }

  /*
   * No forecasting somebody else's decision.
   *
   * The regulation says when the operator MAY SKIP a declaration — surplus at or
   * above 1100 MW and no threat seen. Below the threshold that permission falls
   * away, and nothing takes its place: no rule obliges anyone to declare. So
   * "przywołanie powinno zostać ogłoszone" asserted something the regulation
   * never says.
   *
   * And it cannot be checked. PSE publishes no announcements through any machine
   * interface — the documented reason this app leaves the test call period alone
   * — so the card was making a prediction it could never be held to, to a reader
   * who plans shifts against it. Said eleven times in seventy-two texts before
   * the person reading them caught it.
   *
   * The instruction forbids it too, but an instruction is a request. This is the
   * refusal.
   */
  if (
    /przywołani\w*\s+(powinno|zostanie|będzie|jest spodziewan)|powinno zostać ogłoszon|zostanie ogłoszon|spodziewane jest przywołanie|operator (musi|ogłosi)\b/i.test(
      whole
    )
  ) {
    return { ok: false, reason: 'tekst przesądza decyzję operatora' };
  }

  // Officialese. "Z zachowaniem odstępstwa" was the model's own coinage, minted
  // out of a phrase the facts used to hand it; the facts no longer say it, and
  // the prompt deliberately does not name it either — naming a word to forbid it
  // is how it got copied in the first place. Readers here run the electrical side
  // of a plant, not the capacity market.
  if (/odstępstw|przepisow\w*\s+podstaw/i.test(whole)) {
    return { ok: false, reason: 'urzędowy żargon rynku mocy' };
  }

  const STOPIEN = 'wyraźnie|znacznie|istotnie|mocno|gwałtownie|drastycznie|zdecydowanie';
  const stopniowanie = new RegExp(
    `\\b(${STOPIEN})\\b[^.]{0,40}norm|norm\\w*[^.]{0,40}\\b(${STOPIEN})\\b|` +
      `\\b(${STOPIEN})\\b[^.]{0,15}(pogarsza|poprawia)`,
    'i'
  );
  if (stopniowanie.test(whole)) {
    return { ok: false, reason: 'stopniuje to, czego fakty nie stopniują' };
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

  /*
   * Day names are stripped before the digit ban, for the same reason the 1100 MW
   * threshold is: we hand them to the model ourselves.
   *
   * The window reaches over a weekend, so a day beyond this week is named with
   * its date — "poniedziałek 17 sierpnia" — and the instruction insists on
   * copying that verbatim rather than shortening it. Without this the run
   * refused every answer for containing the very digits it had just demanded,
   * and the card sat frozen with a warning: exactly the deadlock the 1100 MW
   * exception was written to end.
   *
   * Only the exact phrases the facts carried are cleared, so a figure the model
   * invented still has nothing to hide behind.
   */
  /*
   * Only the DATE part of each day name is cleared, and case is ignored.
   *
   * Stripping the whole name matched "w poniedziałek 17 sierpnia" and missed
   * "Poniedziałek 17 sierpnia" at the head of a sentence, and "poniedziałku
   * 17 sierpnia" in the genitive — both ordinary Polish, both then refused for
   * the digit WE told the model to write. Three runs in fourteen went in the bin
   * that way, each leaving the card an hour stale.
   *
   * The weekday inflects; "17 sierpnia" does not, and it is the only part
   * carrying a digit. So that is what gets cleared.
   */
  const daty = allowedDayNames
    .map((name) => /\d{1,2}\s+\p{L}+/u.exec(name)?.[0])
    .filter((fragment): fragment is string => Boolean(fragment));

  const withoutHours = daty
    .reduce(
      (text, fragment) =>
        text.replace(new RegExp(fragment.replace(/\s+/g, '\\s+'), 'gi'), ''),
      whole
    )
    .replace(/\b1100\s*MW\b/gi, '')
    .replace(HOUR_PATTERN, '');
  if (/\d/.test(withoutHours)) {
    return { ok: false, reason: 'tekst zawiera liczbę spoza godzin' };
  }

  return { ok: true };
}
