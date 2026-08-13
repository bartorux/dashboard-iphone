# Stan prac

Na czym stanęliśmy 11 sierpnia 2026, wieczorem. README opisuje, **jak aplikacja działa**; ten plik
opisuje, **co jest otwarte** — czego nie widać ani w kodzie, ani w historii commitów.

## Punkt odniesienia

- **`v3.31.1`** na produkcji, 398 testów przechodzi
- backup przed warstwą AI w trzech warstwach na **`v3.28.3`**, każda odtworzona i sprawdzona:
  gałąź `backup/v3.28.3-przed-warstwa-ai` i tag `v3.28.3-przed-warstwa-ai` na `origin`, archiwum
  `~/Documents/dashboard-iphone-backup-v3.28.3.tar.gz` (rozpakowane, `diff -r` czysty)
- punkty pośrednie: `v3.29.0`, `v3.29.1`, `v3.30.0`, `v3.30.1`, `v3.30.2`, `v3.31.0`, `v3.31.1`

## Co doszło tego popołudnia

Trzy podsystemy, wszystkie po stronie generatora — **przeglądarka nie pobiera ani bajta więcej**.

- **Log prognoz** (`data/forecast-log.json`) — co przebieg zapisuje najniższy i średni margines
  każdej doby, liczony po godzinach 07:00–22:00, bo tylko taki zbiór nie kurczy się z upływem dnia.
- **Warstwa przyczyny** (`generationNorm.ts`) — dlaczego dana godzina jest najciaśniejsza, liczone
  z miksu wobec 30-dniowej mediany. Historia dla skryptu idzie z polami generacji, dla przeglądarki
  bez zmian.
- **Log tekstów** (`data/summary-log.json` + `scripts/teksty.ts`) — każda odpowiedź modelu, także
  odrzucona. Zasilony wstecz z historii gita: 57 tekstów.

Prompt przeszedł z wersji 26 na 32.

## Otwarte, do rozstrzygnięcia na danych

Oba czekają na dobę w logach — nie na pomysł, tylko na pomiar.

- **Etap 3: zdanie o ruchu prognozy.** Cała maszyneria zbiera; brakuje wyłącznie głębokości.
  Docelowo: „prognoza na czwartek pogarsza się trzeci przebieg z rzędu".
- **Czy dzień wiodący ma pochodzić z całego okna.** Rano argumentowałem, że nie — że karta prowadzi
  prognozą sześciodniową, czyli najmniej pewną. **Po siedmiu godzinach dane tego nie potwierdzają:**
  dziś 0 MW rozrzutu, ale najbardziej ruszyło się JUTRO (843 MW), nie dzień najdalszy (597 MW).
  Teza „im dalej, tym mniej pewne" nie broni się na tym, co mamy. Reguła została nietknięta.
- **Format trzywierszowy przy dniach z podstawami.** Układ „odpowiedź najpierw" naprawiliśmy tylko
  dla dni spokojnych. Dzień z podstawami chodzi po staremu i to on ma teraz „przywołanie" dwa razy —
  ale po przeczytaniu wygląda to na uzasadnione: ten sam stan prawny dotyczy dwóch różnych dni,
  a model sam zaznacza to słowem „również". Do obejrzenia, gdy takich dni uzbiera się kilka.

## Zapisane, nienaprawiane

- **Prognoza dryfuje w dół, a pasmo zbudowane jest z wartości osiadłych.** Z logu prognoz, pięć
  dób: −635, −159, −392, −2204, −899 MW między pierwszą a ostatnią migawką. **Wszystkie pięć w tę
  samą stronę**, średnio 858 MW — 40% szerokości pasma typowego. Porównujemy więc prognozę świeżą,
  jeszcze optymistyczną, z historią prognoz już zweryfikowanych przez czas. Pięć dób to za mało,
  żeby korygować, i za dużo, żeby zignorować. Kierunki na potem: budować pasmo z prognoz o tym
  samym wyprzedzeniu (log właśnie zaczyna to umożliwiać) albo nie porównywać dób odległych w ogóle.
- **Pojedynczy skok godzinowy bywa większy niż cały dobowy dryf.** Zmierzone: doba 12.08 przesunęła
  się o 1032 MW przez 31 godzin, przy największym skoku między dwiema kolejnymi migawkami równym
  1339 MW. Dlatego etap 3 nie może porównywać dwóch migawek — musi porównywać mediany z okien
  i odzywać się dopiero, gdy przesunięcie przerasta zmierzoną skoczność danej doby.

- **„W tych dniach nie ma podstaw"** — „tych" nie wskazuje na nic, co czytelnik widzi. Wziąłem to
  dosłownie ze swojej instrukcji, więc model przepisał moje sformułowanie. Jedno słowo do zmiany,
  najlepiej przy okazji etapu 3, bo instrukcję i tak trzeba będzie wtedy tknąć.
- **Liczby zapisane słownie przechodzą walidator.** „z ostatnich trzydziestu dni" mija kontrolę, bo
  blokuje ona cyfry, nie słowa.
- **Zielony przebieg regresji wizualnej nie znaczy „bez zmian".** Opisane w README.

## Gotowa praca, która czeka na wyjęcie

Gałąź **`feat/gest-sledzacy-palec`** jest lokalna i nigdzie nie wypchnięta. Commit `8ed629c` zawiera
odrzucone przeciąganie palcem — decyzja stoi — ale w tym samym commicie siedzą cztery naprawy, które
z gestem nie mają nic wspólnego: brak obsługi `touchcancel`, nasłuchy zdejmowane co klatkę, sztuczna
sekunda kręciołka, i wyciszenie ruchu niesięgające wykresów. Wyjęcie: cofnąć `App.tsx`
i `gestureMath.ts`, zostawić `useTouchGestures.ts`, `PullToRefresh.tsx` i `chart/shared.tsx`.

## Czego dzień nauczył

1. **Zielony test nie jest testem sprawdzonym.** Każda nowa asercja sprawdzona mutacją — dziś
   kilkadziesiąt mutacji, z czego kilka przeżyło pierwsze podejście i wymusiło mocniejsze testy.
2. **Gdy model pisze coś niechcianego, sprawdzić najpierw, czy sami mu tego nie podaliśmy.** Zadziałało
   sześć razy. Najdobitniej: prompt podawał frazę „nie ma podstaw do przywołania" **siedem razy**,
   a powód **raz** — i model pisał to, co widział siedmiokrotnie.
3. **Nie żądać na wejściu tego, co odrzucamy na wyjściu.** Kazałem pisać „poniedziałek 17 sierpnia",
   a walidator odrzuca cyfry — każda odpowiedź leciała. Ten sam błąd co kiedyś przy progu 1100 MW,
   opisany w tym samym pliku.
4. **Rzadki błąd to argument za twardą odmową, nie za prośbą.** Liczba mnoga dnia tygodnia wypadła
   raz na 61 tekstów; prośba w instrukcji działałaby w większości przypadków, a błąd i tak w
   większości przypadków nie występował.
5. **Przegląd zbiorczy widzi to, czego nie widać po kolei.** Liczba mnoga wyszła z przeglądu 61
   tekstów naraz, nie z czytania karty. Tak samo cała historia jakości: wersje do 25 nazywały werdykt
   dwa razy przy 350–550 znakach, wersja 26 zeszła do jednego i 150 znaków.

## Środowisko

Node nie jest w `PATH`:

```bash
export PATH="$HOME/.local/nodejs/node-v24.19.0-darwin-arm64/bin:$PATH"
```

`gh` nie jest zainstalowane — zadań Actions nie da się uruchomić z tej maszyny. Wdrożenie skryptu
i promptu rozpoznaje się po odcisku oceny (`#vNN`) w `summary.json`, nie po nazwie bundla: zmiany
w generatorze nie zmieniają plików, które pobiera przeglądarka.

Przed wdrożeniem: `npm run typecheck && npm test && npm run build`, wzorce wizualne przepisane
i obejrzane przez `git status`, a każda nowa asercja sprawdzona mutacją.
