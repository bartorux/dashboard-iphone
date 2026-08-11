# Stan prac

Na czym stanęliśmy 11 sierpnia 2026. README opisuje, **jak aplikacja działa**; ten plik opisuje,
**co jest otwarte** — czego nie widać ani w kodzie, ani w historii commitów.

## Warstwa AI: etap 3 czeka na dane

Etapy 1 i 2 są zrobione — zapis prognoz i przyczyna ciasnej godziny. **Etap 3, ruch prognozy, nie
został zaczęty i nie dało się go zacząć**: `data/forecast-log.json` ma na razie jeden wpis, a żeby
powiedzieć „prognoza na czwartek pogorszyła się od rana", trzeba doby zbierania.

Do zrobienia, gdy log ma głębokość:

- pole w `DayFacts` z różnicą wobec migawki sprzed ~24 godzin i wobec dzisiejszego poranka,
  przełożoną **na słowa w kodzie**, jak przyczyna
- próg istotności w MW, żeby szum prognozy nie szedł jako nowina — punktem wyjścia 100 MW, tak jak
  w odcisku oceny
- rozszerzenie `hasSomethingToExplain` o ruch, tak jak zostało rozszerzone o przyczynę
- pierwszy przypadek testowy jest już zmierzony: +139 MW → +1331 MW na środowej 20:00, między 11:20
  a 13:20 jedenastego sierpnia

Uwaga na tę samą pułapkę co w etapie 1: porównywać wolno **wyłącznie agregaty po stałym zbiorze
godzin**. `snapshotDay` już to robi; cokolwiek nowego liczy różnice, musi brać dane stamtąd, a nie
z `DayFacts`, które patrzą tylko przed siebie.

## Punkt odniesienia

- **`v3.28.3`** na produkcji, 295 testów przechodzi, drzewo czyste
- backup przed warstwą wizualną w trzech warstwach na **`v3.26.1`**, każda odtworzona i sprawdzona:
  gałąź `backup/v3.26.1-przed-warstwa-wizualna` na `origin`, archiwum
  `~/Documents/dashboard-iphone-backup-v3.26.1.tar.gz` (rozpakowane i porównane), migawka tagu
  pod `github.com/bartorux/dashboard-iphone/archive/refs/tags/v3.26.1.tar.gz`

Dzień zamknął się na szesnastu wdrożeniach, `v3.20.0` → `v3.28.3`.

## Gotowa praca, która czeka na wyjęcie

Gałąź **`feat/gest-sledzacy-palec`** jest lokalna i nigdzie nie wypchnięta. Commit `8ed629c` zawiera
odrzucone **przeciąganie palcem** — decyzja stoi, nie wracamy do niego — ale w tym samym commicie
siedzą cztery naprawy, które z gestem nie mają nic wspólnego i których nikt nie odrzucał:

- **brak obsługi `touchcancel`** — połączenie przychodzące zostawia wskaźnik pociągnięcia wiszący
  na ekranie
- **nasłuchy zdejmowane i zakładane co klatkę** podczas pociągania do odświeżenia
- **sztuczna sekunda** kręciołka po tym, jak dane już przyszły
- **wyciszenie ruchu nie sięga wykresów** — kto prosi system o mniej animacji, dostaje pełne 450 ms
  Recharts, bo to prop Reacta, nie właściwość CSS

Wyjęcie polega na cofnięciu zmian w `App.tsx` i `gestureMath.ts`, a zostawieniu poprawek
w `useTouchGestures.ts`, `PullToRefresh.tsx` i `chart/shared.tsx`.

## Zapisane, nienaprawiane

- **Liczby zapisane słownie przechodzą walidator.** „z ostatnich trzydziestu dni" minęło kontrolę,
  bo blokuje ona cyfry, nie słowa. Reguła dopuszcza słowne liczby godzin; dni już nie, ale nikt tego
  nie sprawdza. Jedno wystąpienie, więc na razie tylko notatka.
- **Zielony przebieg regresji wizualnej nie znaczy „bez zmian".** Opisane w README, w sekcji
  o regresjach wizualnych, razem z propozycją, co z tym zrobić.
- **Krótszy kształt promptu mówi modelowi jedno zdanie nieprawdy.** `FORMAT_WITHOUT_BODY`
  uzasadnia brak środkowego wiersza tym, że „w żadnym dniu nie ma podstaw do przywołania ani
  wąskiego marginesu", tymczasem przełącznik `hasSomethingToExplain` patrzy wyłącznie na podstawy.
  Przy wąskim, ale dodatnim marginesie — 11 sierpnia dokładnie taki przypadek — model dostaje
  zdanie sprzeczne z faktami, które czyta trzy akapity niżej. Tekst wyszedł poprawny, więc
  poprawka może zaczekać, ale to jest dokładnie ten wzorzec, który dziś kosztował cztery podejścia:
  najpierw sprawdzić, co sami podaliśmy modelowi.

## Czego świadomie nie wznawiamy

- **Warstwy wizualnej** (typografia, materiał na chromie). Etap pierwszy — przeciąganie — został
  odrzucony, a dwa pozostałe były zatwierdzone w pakiecie z nim. Wracać do tego warto z czystą
  głową, nie po szesnastu wdrożeniach.
- **Kolejnej iteracji promptu.** Tekst jest dobry: cztery zdania przy spokojnym okresie sprowadzają
  się do dwóch, „przywołanie" pada raz, godzina raz. Czwarte podejście do tej samej linijki
  zadziałało dopiero przez usunięcie miejsca na powtórzenie; piąte byłoby powrotem do wzorca, który
  zawiódł trzy razy.

## Czego dzień nauczył

Trzy sygnały z jednej doby, warte pamiętania przy wznowieniu:

1. **Zielony test nie jest testem sprawdzonym.** Dwa razy test przechodził na zepsutym kodzie
   i wyszło to dopiero przy mutacji: raz brakowało zasianego cache'u w `localStorage`, więc stary
   i nowy initializer zachowywały się identycznie; raz asercja nie obejmowała pola, o które chodziło.
   Każda nowa asercja **sprawdzona mutacją**, zanim uznamy ją za pilnującą czegokolwiek.
2. **Gdy model pisze coś niechcianego, sprawdzić najpierw, czy sami mu tego nie podaliśmy.**
   Cztery razy tego dnia usunięcie przyczyny zadziałało tam, gdzie kolejny zakaz w instrukcji nie.
3. **Regresja produkcyjna ujawniła się przypadkiem.** Karta analizy zniknęła z produkcji na
   `v3.28.0` i wyszło to przy próbie zrzutu ekranu, nie przez żaden mechanizm kontroli. Zmiana
   dotykająca kształtu rekordu wymaga przejścia przez wszystkie trzy warstwy, które go czytają.

## Środowisko

Node nie jest w `PATH`:

```bash
export PATH="$HOME/.local/nodejs/node-v24.19.0-darwin-arm64/bin:$PATH"
```

`gh` nie jest zainstalowane — zadań Actions nie da się uruchomić z tej maszyny. Postęp wdrożenia
sprawdza się przez porównanie nazwy pliku bundla na
[produkcji](https://bartorux.github.io/dashboard-iphone/).

Przed wdrożeniem: `npm run typecheck && npm test && npm run build`, a wzorce wizualne przepisane
i obejrzane przez `git status`, nie przez zielony przebieg.
