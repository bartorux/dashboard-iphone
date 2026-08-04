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

## Widoki wykresu

Jedna karta, jedna oś czasu, trzy odczyty — przełączane segmentowanym
kontrolerem, żeby strona nie rosła o kolejne wykresy.

**Rezerwa** — dostępna i wymagana rezerwa. Pasma tła to progi alertów odmierzane
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
