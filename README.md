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

`scripts/screenshots.mjs` renderuje aplikację w rozdzielczości iPhone'a
z podstawionymi danymi, w obu motywach, i zgłasza błędy konsoli oraz poziome
przepełnienie layoutu.
