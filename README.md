# PSE Dashboard

PWA monitorująca prognozowane rezerwy mocy w Krajowym Systemie Elektroenergetycznym.
Dane pochodzą z [API raportów PSE](https://api.raporty.pse.pl/api/pk5l-wp)
(raport PK5L-WP). Aplikacja jest przeznaczona na iPhone'a, dodawana do ekranu
głównego i hostowana na GitHub Pages.

Produkcja: https://bartorux.github.io/dashboard-iphone/

## Uruchomienie

Wymagany Node 24 (wersja używana też w CI).

```bash
npm ci
npm run dev
```

| Polecenie | Opis |
| --- | --- |
| `npm run dev` | serwer deweloperski |
| `npm run build` | build produkcyjny do `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testy jednostkowe i komponentów (Vitest) |
| `npm run test:api` | test kontraktu na żywym API PSE — poza CI |
| `node scripts/screenshots.mjs` | zrzuty ekranu iPhone'a w trybie jasnym i ciemnym |
| `node scripts/states.mjs` | zrzuty stanów trudnych do wywołania ręcznie |
| `npm run test:visual` | porównanie z wzorcami — wymaga uruchomionego `npm run dev` |
| `npm run test:visual:update` | zapisanie nowych wzorców po świadomej zmianie wyglądu |
| `npx tsx scripts/facts.ts` | fakty wysyłane do modelu, policzone z żywych danych — bez klucza |
| `npx tsx scripts/summary.ts --dry-run` | to samo plus pełne zapytanie i odcisk oceny |
| `GEMINI_API_KEY=… npx tsx scripts/summary.ts` | wygenerowanie `public/summary.json` |

## Analiza AI

Karta pod bieżącym marginesem odpowiada zdaniem na pytanie, po które sięga się najczęściej:
**czy grozi okres przywołania** — w horyzoncie trzech dni, na tle ostatnich 30 dób.

**Ocenę liczy kod, model wyłącznie ją opisuje.** Warunki przywołania są sformalizowane, więc
`callPeriod.ts` rozstrzyga je arytmetyką: dzień roboczy, godziny 07:00–22:00, rezerwa poniżej
wymaganej, próg 1100 MW.

Nazwy stanów biorą się wprost z przepisu, który reguluje, kiedy operator **może nie ogłaszać**
przywołania: gdy nadwyżka mocy ponad zapotrzebowanie sieci nie jest niższa niż **1100 MW**
*i* operator uzna, że nie ma zagrożenia dla pokrycia zapotrzebowania — oba warunki łącznie.

| stan | co znaczy |
| --- | --- |
| brak podstaw | rezerwa pokrywa wymaganą, albo godzina wypada poza dniem roboczym lub oknem 07:00–22:00 |
| operator może nie ogłaszać | rezerwa poniżej wymaganej, ale nadwyżka trzyma się powyżej progu 1100 MW |
| przywołanie powinno zostać ogłoszone | nadwyżka poniżej progu 1100 MW, więc operator nie ma już podstaw, by go nie ogłaszać |

„Może nie ogłaszać", nie „może odstąpić": drugie zakłada, że przywołanie już wisi i operator
się z niego wycofuje — a przepis mówi wprost, że **operator może nie ogłaszać** okresu przywołania.
Bliżej źródła i mniej alarmująco. Podobnie „powinno", nie „musi": przepis reguluje, kiedy wolno
nie ogłaszać, a nie nakłada wprost obowiązku w drugą stronę. To osobna warstwa od **progów alertów ustawianych przez użytkownika** — te
sygnalizują wcześniej i mówią, że coś może się zdarzyć, nie że cokolwiek jest należne.

Model dostaje gotowy wniosek — łącznie ze wskazaniem, **który dzień jest istotny**, bo proszony
o wybranie go samodzielnie mylił się mniej więcej co drugi raz, podając wtorkowy wieczór
jako „dziś".

**Żadna liczba w tekście nie pochodzi od modelu.** Instrukcja zakazuje cyfr poza godzinami
`HH:MM`, a walidacja odrzuca tekst z liczbą, z godziną spoza faktów oraz z wielkością mocy zapisaną
słownie — bo tak jeden przebieg obszedł zakaz, pisząc „granicy trzystu megawatów".

**Kalendarz dni roboczych** liczy święta ruchome od Wielkanocy. Bez tego Boże Ciało czy
Poniedziałek Wielkanocny wyszłyby jako dzień roboczy i ocena kłamałaby dokładnie w dni,
w które najmniej osób patrzy na dashboard.

**Patrzymy wyłącznie przed siebie.** Godziny, które minęły, wypadają z oceny: ogłoszenie wymaga
ośmiogodzinnego wyprzedzenia, więc nic już z nimi nie zrobisz, a wliczanie ich kazałoby o południu
uznać dzień za groźny na podstawie nocy dawno zamkniętej.

Poza zakresem świadomie: **testowy okres przywołania (TOP)**. Jest z definicji niezwiązany ze
stanem systemu, ogłaszany najwyżej raz na kwartał, a PSE nie udostępnia ogłoszeń interfejsem
maszynowym — pytany o to model musiałby zmyślać.

### Jak to jest dostarczane

Generowanie zachodzi **wyłącznie w harmonogramie**, nigdy przy wejściu na stronę. Przeglądarka
czyta gotowy `public/summary.json`, więc liczba odwiedzających nie ma wpływu na zużycie limitu.

`.github/workflows/summary.yml` chodzi **co godzinę**, nie o stałej porze dnia — to rozpuszcza
różnicę między UTC w cronie a czasem polskim w danych PSE, bo przy pracy co godzinę przesunięcie
przestaje mieć znaczenie. Wewnątrz i tak wszystko liczy się z `plan_dtime_utc`.

Minuta jest **nietypowa (`:37`)**, i to nie przypadek: przy `:05` przebiegi lądowały regularnie
35–45 minut po czasie. Zadania cykliczne stoją w kolejce za wszystkim innym, a początek pełnej
godziny to moment, na który celuje najwięcej cronów. Nic dalej od tej minuty nie zależy — fakty
patrzą przed siebie, więc środek godziny jest tak samo dobry jak jej początek.

Model jest wołany, **gdy zmieni się ocena albo gdy tekst przekroczy sześć godzin**. To drugie
jest zabezpieczeniem: karta chowa podsumowanie starsze niż dwanaście godzin, więc spokojna noc
przy stabilnej prognozie mogłaby utrzymać ocenę niezmienioną na tyle długo, że karta zniknęłaby
nad ranem — i to nie dlatego, że coś jest nie tak, tylko dlatego, że uznaliśmy tekst za wciąż
dobry. Sześć godzin to połowa progu ukrycia, więc zapas jest szeroki.

Odcisk oceny świadomie pomija liczbę godzin
przed nami i średnią — obie zmieniają się co godzinę z samego upływu czasu, więc odcisk nigdy nie
wyglądałby na niezmieniony i cały mechanizm byłby martwy. Najniższy margines jest zaokrąglany do
stu megawatów, żeby drobna korekta prognozy nie liczyła się jako nowina.

**Workflow publikuje stronę sam.** Commit nie wystarcza: push wykonany `GITHUB_TOKEN`-em celowo nie
uruchamia kolejnych workflowów, więc `deploy.yml` nigdy go nie widzi. Bez tego analiza przeliczała
się co godzinę do pliku, którego nikt nie serwował. Publikacja jest warunkowana faktyczną zmianą,
więc spokojna godzina nie rusza service workera na telefonach.

Wymagane w ustawieniach repozytorium: sekret **`GEMINI_API_KEY`** oraz **Settings → Actions →
Workflow permissions → Read and write**. Bez tego drugiego deklaracja `contents: write` w workflow
nic nie da — może uprawnienia tylko zawężać, nigdy rozszerzać.

Model: `gemini-3.5-flash-lite`, myślenie na `minimal`. Podnoszenie go zmierzono jako szkodliwe —
1919 tokenów myślenia, trzykrotny koszt i ucięta odpowiedź. Całe rozumowanie zrobiono w kodzie,
więc nie ma tam czego przemyśliwać. Jedno wywołanie to ~1150 tokenów, maksymalnie 24 na dobę,
czyli około 2,4% darmowego limitu.

### Strażnik świeżości

`.github/workflows/analiza-zywa.yml` sprawdza raz dziennie, czy **opublikowana** analiza nie jest
starsza niż 15 godzin, i **czerwieni się**, jeśli jest.

Bez tego cała funkcja mogłaby umrzeć po cichu: gdy harmonogram przestanie chodzić — GitHub wyłącza
zadania cykliczne po 60 dniach bezczynności repozytorium, klucz może wygasnąć, limit się skończyć —
nie zdarzy się nic głośnego. Tekst przestanie się odświeżać, po dwunastu godzinach karta zniknie,
a reszta dashboardu będzie działać normalnie. Zauważyłbyś to dopiero, sięgając po kartę.

Sprawdzany jest plik **z GitHub Pages, nie z repozytorium**. To rozróżnienie ma znaczenie: commit
może wylądować przy zepsutym wdrożeniu i wtedy repozytorium wygląda zdrowo, a karta na telefonie
i tak jest stara.

Próg 15 godzin, bo generator odświeża co najwyżej co 6 godzin — piętnaście oznacza więc co najmniej
dwa nieudane cykle. Krótszy dawałby fałszywe alarmy przy opóźnieniach harmonogramu, które w Actions
są normą.

### Zachowanie karty

Znika, gdy tekst ma ponad **12 godzin** — analiza wskazuje konkretne godziny, a gdy te miną, opisuje
inny dzień niż wykres pod nią. Brak pliku, uszkodzony JSON i brak sieci kończą się tak samo: karty
nie ma, reszta ekranu działa bez zmian, bo wszystko poza nią pochodzi wprost z PSE.

Zakres dni jest **wyliczany przy czytaniu**, nigdy zapisywany do pliku — inaczej analiza napisana
o 23:50 i otwarta po północy nazywałaby „dziś" dzień, który już był wczoraj.

Kartę można zwinąć, a wybór jest **zapamiętywany na urządzeniu**; trzymany w stanie komponentu
wracałby rozwinięty przy każdym uruchomieniu. Nagłówek zostaje widoczny również po zwinięciu, bo
to on jest odpowiedzią. Preferencja leży w `localStorage` obok motywu i progów — treść analizy jest
wspólna dla wszystkich, ustawienia są prywatne.

## Dynamic Type

Aplikacja skaluje się razem z ustawieniem **Rozmiar tekstu** w iPhonie. Sprawdzone na urządzeniu,
z aplikacją dodaną do ekranu głównego — **działa**, wbrew temu, co sugerowała część źródeł
o widokach osadzonych.

Trzeba obu rzeczy naraz i żadna sama nie wystarczy:

1. `font: -apple-system-body` na `:root` w [App.css](src/App.css) — bez tego iOS nie stosuje
   swojego ustawienia do treści rysowanej przez przeglądarkę i `rem` nie ma od czego liczyć
2. wszystkie rozmiary tekstu w `rem`, nie w pikselach

**Wykresy wymagały osobnego potraktowania.** Recharts przyjmuje rozmiar czcionki jako liczbę
w propsach, nie przez CSS, więc podpisy osi zostawały małe, gdy reszta rosła — akurat ta część
ekranu, która niesie liczby. Stąd `AXIS_FONT_SIZE` i `LABEL_FONT_SIZE`
w [chart/shared.tsx](src/components/chart/shared.tsx). Z tego samego powodu `axisWidthFor` skaluje
szerokość osi Y odczytanym rozmiarem bazowym: szerokość ustalona dla podpisu 11 px **ucinała oś**,
gdy tekst urósł.

Scenariusz wizualny `duzy-tekst-light` renderuje całość przy powiększonej czcionce, bo złamanie
układu przy dużym tekście jest niewidoczne we wszystkich pozostałych zrzutach.

## Widoki wykresu

Jedna karta, jedna oś czasu, trzy odczyty — przełączane segmentowanym
kontrolerem, żeby strona nie rosła o kolejne wykresy.

**Rezerwa** — dostępna i wymagana rezerwa, plus stała linia **1100 MW**. Operator może odstąpić
od ogłoszenia okresu przywołania mimo spadku rezerwy poniżej wymaganej, jeżeli nadwyżka mocy nie
jest niższa niż 1100 MW i uzna, że nie ma zagrożenia dla pokrycia zapotrzebowania. Wyjaśnienie kryje się pod znakiem zapytania przy pozycji legendy — na stałe zajmowało sześć linii
i spychało wykres poza pierwszy ekran. Próg dotyczy krzywej dostępnej rezerwy — schodzi ona poniżej niego w 2,3% godzin, więc zachowuje się jak
warunek wyjątkowy; odniesienie go do marginesu dawałoby 34,6%. To wartość regulacyjna, nie
ustawienie użytkownika, dlatego ma odrębny styl od pasm progów alertów. Pasma tła to progi alertów odmierzane
**od krzywej wymaganej**, nie wartości bezwzględne: czerwone sięga `wymagana +
próg alarmu`, pomarańczowe do `wymagana + próg uwagi`. Dlatego falują razem
z wymaganą, która zmienia się co godzinę.

**Generacja** — cały miks w podziale na frakcje: fotowoltaika, wiatr
i pozostałe źródła sumują się do generacji łącznej, a nad stosem biegnie linia
zapotrzebowania. Odstęp między nimi to wymiana zagraniczna. Odpowiada na
pytanie, dlaczego margines spada: godziny alarmowe mają średnio o 4366 MW
wyższe zapotrzebowanie i o 4153 MW niższą generację PV niż spokojne, a 73 z 92
wypadają między 17:00 a 23:00.

Frakcja „pozostałe" to `generacja - PV - wiatr` i bywa ujemna: w 4 godzinach na
792 prognoza PV przekracza generację łączną. Na wykresie jest wtedy przycinana
do zera, ale dymek podaje rozbieżność wprost, zamiast pozwolić stosowi ją
połknąć. Ubytki mocy nie są rysowane — różnią się o zaledwie 110 MW między
godzinami alarmowymi a spokojnymi, więc linia dla nich niczego by nie
wyjaśniła; wartość jest w dymku.

**Na tle 30 dni** — margines wybranego dnia (`dostępna - wymagana`) na tle
rozstępu 10.–90. percentyla dla tej samej godziny w minionych dobach. Widok
nazywa dzień po imieniu, bo obsługuje także Jutro i Pojutrze. Dane pobierane
dopiero przy pierwszym wejściu w ten widok i cache'owane do północy.

## Analiza i trendy

Wszystkie wartości w tej sekcji to **margines** (`dostępna - wymagana`), nie surowa rezerwa.
Uśrednianie samej rezerwy pomija fakt, że wymagana rezerwa też się zmienia — na 33 dobach wahała
się godzinowo od 1033 do 2016 MW. Porównanie dwóch dni po rezerwie daje wniosek przeciwny do porównania po
marginesie mniej więcej w jednej parze na jedenaście; fixture
`pse-reserve-vs-margin.json` utrwala jeden taki przypadek jako test regresji.

Punktem odniesienia jest zawsze **dziś**, a nie dzień sąsiedni — inaczej odniesienie zmieniałoby
się przy każdym przełączeniu zakładki. Na zakładce Dziś blok porównania się nie renderuje.

## Progi alertów

Progi ustawiane przez użytkownika są ograniczone zakresem wziętym z rozkładu marginesu na 792
zmierzonych godzinach. Alarm: **0–1500 MW**, uwaga: **1–2000 MW**, przy czym alarm musi być niższy.

Dolna granica alarmu wynika z tego, że deficyt jest alarmem z definicji — wartość ujemna
twierdziłaby coś przeciwnego i po cichu przestałaby oznaczać realne niedobory. Górne biorą się
z pokrycia: próg 1500 MW oznacza już połowę wszystkich godzin, 2000 MW ponad dwie trzecie,
a powyżej poziomy przestają cokolwiek rozróżniać.

Wartość spoza zakresu jest **odrzucana z komunikatem**, nie przycinana po cichu — podmiana
wpisanej liczby bez powiedzenia o tym jest gorsza niż odmowa. Wyjątkiem jest wczytywanie: wartości
zapisane zanim granice powstały są przycinane, bo odmowa zostawiłaby aplikację bez ustawień,
a zapisane wcześniej 999999 psułoby wykres przy każdym wejściu.

## Świeżość danych

Prognoza PSE jest korygowana często — dla trzech dób naliczyłem 32 różne momenty publikacji, czyli
mniej więcej co godzinę–dwie. Dlatego aplikacja pobiera dane **przy powrocie z tła**, jeśli
ostatnie pobranie jest starsze niż dwie minuty, i **wstrzymuje odpytywanie, gdy jest w tle**.
Bez tego otwarcie appki po kilku godzinach pokazywałoby wersję kilkukrotnie już nieaktualną:
`setInterval` w tle jest na iOS silnie dławiony.

`getDataForDay` czyta zegar, więc wycinek doby jest przeliczany także przy **przełomie północy** —
`usePSEData` trzyma w stanie bieżącą datę handlową i wpuszcza ją do zależności memo. Bez tego
zakładki pokazywałyby nową datę, a wykres wciąż wczorajszą dobę, przez maksymalnie 15 minut.
Timer jest liczony do najbliższej północy, nie co 24h — doby DST mają 23 albo 25 godzin.

## Regresje wizualne

`npm run test:visual` renderuje osiem scenariuszy (widoki wykresu, oba motywy, ustawienia, brak
danych) i porównuje piksele z wzorcami w `screenshots/baseline/`. Powstało po tym, jak dwa defekty
wizualne trafiły na produkcję mimo zielonych testów: ucięta oś Y i wcięcia w dymku, które nigdy
się nie zastosowały.

Zegar w przeglądarce jest **zamrożony**, bo aplikacja tnie dane po dzisiejszej dobie — bez tego
wzorce psułyby się następnego dnia. Zrzuty zapisywane w skali 1×: układ łapie się tak samo,
a pliki są kilkukrotnie mniejsze niż przy 3×. Poza CI, bo wymaga pobranej przeglądarki.

`summary.json` jest w tych scenariuszach **podstawiany**: prawdziwy plik nosi bieżący znacznik
czasu, który wobec zamrożonego zegara wygląda na przyszłość — a kartę, która twierdzi, że powstała
jutro, aplikacja słusznie odrzuca, więc bez podstawienia znikała ze wszystkich zrzutów. Podstawiony
tekst jest dobrany do danych, nad którymi stoi: wzorzec przeczący własnemu wykresowi uczy oko
pomijać dokładnie to, co te zrzuty mają łapać.

**Czego ten mechanizm nie zauważy:** zmian mniejszych niż tolerancja **0,1%** strony. Dodanie
ikony 16×16 to 0,04% i przechodzi jako „ok" na wszystkich ośmiu scenariuszach. Tolerancja jest
potrzebna, żeby wygładzanie czcionek nie generowało fałszywych alarmów, ale to znaczy, że
regresja wizualna pilnuje **układu**, a nie obecności drobnych elementów — te trzeba obejrzeć,
wymuszając zapis wzorców.

## Gesty

Dotknięcie wykresu otwiera dymek ze szczegółami wraz z kropką na serii i pionową linią kursora;
powtórne dotknięcie zamyka wszystkie trzy naraz. Kropka to `activeDot` serii, sterowany osobnym
stanem niż dymek, więc trzeba ją wygasić jawnie — inaczej zostaje i wskazuje godzinę, którą
użytkownik już zamknął. Powtórne dotknięcie zamyka dymek — Recharts
otwiera go sam, ale na telefonie nie ma wskaźnika, który mógłby go zamknąć.
Przeciąganie po wykresie odczytuje kolejne godziny i dymka nie zamyka.

Przesunięcie palcem w lewo i prawo zmienia dzień, pociągnięcie w dół odświeża.
Oba obsługuje jeden hook ([useTouchGestures](src/hooks/useTouchGestures.ts)):
dwa niezależne mogłyby uznać ten sam ruch po skosie za swój. Pierwsze ~10 px
przypisuje gest do jednej osi. Przeciąganie po samym wykresie nie zmienia dnia —
ten ruch służy do odczytu dymka.

## Model danych

PSE oznacza okresy **końcem** przedziału: okres `00 - 01` ma `plan_dtime`
`01:00`. Doba handlowa biegnie więc od `01:00` do `00:00` dnia następnego,
a nie od północy do północy.

Dwie pułapki, które wynikają z tego formatu:

- **`plan_dtime` bywa nieparsowalne.** W dobie z cofnięciem czasu pojawia się
  dosłowna godzina `03a` (`2025-10-26 03a:00:00`). `new Date()` zwraca dla niej
  `Invalid Date`. Kolejność i wykrywanie luk opierają się dlatego na
  `plan_dtime_utc`, które zawsze jest poprawne i monotoniczne.
- **Doba nie zawsze ma 24 godziny.** Przy zmianie czasu ma 23 albo 25 okresów,
  więc dane są dzielone po polu `business_date`, a nie po stałym offsecie.

Godziny w interfejsie pochodzą z pola `period` (`"19 - 20"`), a nie ze stempla
`plan_dtime`. Stempel wskazuje koniec bloku, więc wyświetlanie go wprost
przesuwało każdą godzinę o jedną do przodu — alarm obejmujący 19:00–20:00
pokazywał się jako 20:00–21:00.

Zakres w filtrze API musi mieć pełne znaczniki czasu — filtr porównuje ciągi
znaków, więc sama data jako górna granica wyklucza `... 00:00:00` i ucina
ostatnią godzinę zakresu.

## Aktualizacje u użytkowników

Service worker działa w trybie `autoUpdate`, więc **kod i wygląd aktualizują się
same** przy zimnym starcie aplikacji — bez ponownego dodawania do ekranu
głównego.

Nie aktualizują się bez ponownej instalacji: **ikona** (`apple-touch-icon`),
`manifest.json` i styl paska stanu. iOS odczytuje je raz, w momencie dodawania
aplikacji do ekranu głównego. `apple-touch-icon` musi być plikiem PNG — iOS nie
obsługuje tu SVG i ignoruje ikony z manifestu.

## Testy

Testy jednostkowe działają na zapisanych odpowiedziach API
(`src/utils/__fixtures__/`), w tym na obu dobach zmiany czasu, i nie korzystają
z sieci. Czas systemowy jest ustawiany na stałą wartość, a strefa czasowa
przypięta do `Europe/Warsaw` w [vitest.config.ts](vitest.config.ts).

Progi alertów żyją w `localStorage` telefonu. Gdyby kiedyś powstał mechanizm
wysyłający powiadomienia spoza przeglądarki, musiałby mieć własną kopię progów —
projekt takiego rozwiązania czeka w [docs/powiadomienia-push.md](docs/powiadomienia-push.md).

`scripts/screenshots.mjs` renderuje aplikację w rozdzielczości iPhone'a
z podstawionymi danymi, w obu motywach, i zgłasza błędy konsoli oraz poziome
przepełnienie layoutu.
