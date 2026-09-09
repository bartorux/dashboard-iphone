# Stan prac

Na czym stanęliśmy 11 sierpnia 2026, wieczorem. README opisuje, **jak aplikacja działa**; ten plik
opisuje, **co jest otwarte** — czego nie widać ani w kodzie, ani w historii commitów.

## Punkt odniesienia

- **`v3.31.1`** na produkcji, 398 testów przechodzi
- backup przed warstwą AI w trzech warstwach na **`v3.28.3`**, każda odtworzona i sprawdzona:
  gałąź `backup/v3.28.3-przed-warstwa-ai` i tag `v3.28.3-przed-warstwa-ai` na `origin`, archiwum
  `~/Documents/dashboard-iphone-backup-v3.28.3.tar.gz` (rozpakowane, `diff -r` czysty)
- backup przed kadencją 15 minut w trzech warstwach na **`v3.72.1`**, każda odtworzona
  i porównana: gałąź `backup/v3.72.1-przed-kadencja` i tag `v3.72.1-przed-kadencja` na `origin`,
  archiwum `~/Documents/dashboard-iphone-backup-v3.72.1.tar.gz`
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

## Wiedza, której aplikacja nie zdobędzie sama

**Bywały doby z nadwyżką poniżej progu 1100 MW, w których przywołania nie ogłoszono.**
Obserwacja użytkownika, nie pomiar — i to jedyne dostępne źródło, bo PSE nie publikuje ogłoszeń
żadnym interfejsem maszynowym. Ta sama luka jest powodem, dla którego aplikacja w ogóle nie tyka
testowego okresu przywołania.

Wynika z niej rzecz, którą karta mówiła przez 11 z 72 tekstów, zanim ktoś to zauważył: **„przywołanie
powinno zostać ogłoszone" było po prostu nieprawdą.** Przepis reguluje odstępstwo — pozwala pominąć
ogłoszenie, dopóki nadwyżka trzyma próg — a poniżej progu odstępstwa nie ma. To nie to samo co
obowiązek. Stąd obecne brzmienie oparte na jednym rzeczowniku: *odstępstwo* / *bez odstępstwa*,
w obu stanach otwarte słowami „operator może ogłosić przywołanie".

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

**(Nieaktualne od 05.09.2026 — patrz sprostowanie pod tym akapitem.)** Gałąź **`proto/alerty`** (commit `fda68b7`, wypchnięta na origin) trzyma **oś doby w bloku alertów** —
pasek 24 godzin z oknami alertowymi na swoich miejscach, pod nim najostrzejsze okno w pełni, niżej
pozostałe jednowierszowo. Właściciel obejrzał ją 05.09.2026 i powiedział „kozacko to wygląda"; do
wdrożenia nie weszła tylko dlatego, że **nad kartą alertów stoi wykres rezerwy z własną osią doby,
a te dwie podziałki się nie pokrywają**: tor alertów biegnie od krawędzi karty, pole wykresu zaczyna
się dopiero za opisami osi pionowej. W kontekście całej strony czyta się to jak niedoróbka, nie jak
decyzja (dowód: `kontekst-w2-telefon.png` w materiałach z tamtego dnia).

Warunek wyjęcia: **zrównać rozpiętość toru z polem wykresu** — wspólny token odsunięcia czytany
przez `AlertsPanel.tsx` i `chart/shared.tsx` (`CHART_MARGIN` plus szerokość opisów osi Y), zamiast
dwóch niezależnych szerokości. Wtedy dwie osie doby na jednym ekranie zaczynają się bronić nawzajem,
zamiast sobie przeczyć. Reszta wariantu jest gotowa i przetestowana: obsługuje 7 okien, 1 okno,
dobę bez alertów i stan ładowania, jest o jedną trzecią niższa od listy i niesie ciężkość drugim
kanałem obok barwy (alarm wypełnia pasek na pełną wysokość, uwaga siedzi niżej).

W tej samej gałęzi leżą jeszcze dwie formy odrzucone świadomie: **tabela** (`w3` — najczystsza na
monitorze, ale gubi miękkie tło w tonie ciężkości, więc zła doba czyta się spokojniej niż jest)
i **stan sprzed zmiany** (`w1`). Wszystkie cztery przełącza atrybut `data-alerty` na `<html>`.

**Wyjęte 09.09.2026 (v3.79.0) — sama oś, wyrównana.** Właściciel wybrał wariant „oś nad obecną
listą": do dzisiejszego bloku alertów doszedł 24-godzinny pasek, a lista, Kompas, zdanie o saldzie
i etykiety marginesu zostały nietknięte. Blok „najostrzejsze okno" i przebudowa listy z prototypu
**nie** weszły.

Warunek wyjęcia okazał się większy, niż zapisano wtedy. Zmierzone przed zmianą na telefonie: pole
wykresu zaczynało się **68 px** od krawędzi ekranu w widoku Rezerwa i **81 px** w Generacji — 13 px
różnicy między dwoma widokami tej samej karty, do tego zmienne z dnia na dzień, bo `axisWidthFor`
liczyło szerokość osi z długości najdłuższej etykiety bieżącej doby (myślnik kosztuje tyle co cyfra).
Tor alertów zaczynał się na 28 px. Naprawa: `axisWidthFor()` liczy dla **stałej maksymalnej długości
6 znaków** (`"-1 000"`, `"25 000"` — siedmioznakowe nie występuje w danych PSE), a `dayAxisInset()`
w `chart/shared.tsx` jest jedynym źródłem prawdy o odsunięciu dla obu kart; wypełnienia kart
(`p-3` wykres, `p-4` alerty) siedzą tam jako nazwane stałe, pilnowane testem źródłowym
`src/__tests__/dayAxisAlignment.test.ts` — zmiana wypełnienia którejkolwiek karty psuje test zamiast
po cichu rozjeżdżać podziałki. Po zmianie zmierzone: **81 px i 359 px w obu widokach, tor identycznie**.

Skutek uboczny, sam w sobie dobry: wykres przestał **skakać w poziomie** przy zmianie doby.

**Doba na wykresie miała 23 godziny — poprawione tego samego dnia (v3.80.0).** Wyrównanie krawędzi
nie wystarczyło: właściciel zauważył, że wewnątrz obu osi ta sama godzina ląduje gdzie indziej.
Zmierzone: wykres kładł godzinę `h` na `81 + h × 12,087` px, pasek na `81 + h × 11,583`. Rozjazd
rósł z godziną — 3 px o 06:00, **9,6 px o 19:00**, 11,1 px o 22:00, czyli najbardziej tam, gdzie są
alerty. Przyczyna: Recharts kładzie pierwszą i ostatnią kategorię na krawędziach pola, więc 24
godziny (`00:00`…`23:00`) dawały **23 odstępy** na całą szerokość — wykres twierdził, że doba kończy
się o 23:00, choć ostatni odczyt opisuje blok do północy. Naprawa: `withDayEnd` w `chart/shared.tsx`
dopisuje 25. wiersz zamykający o kluczu `24:00`, kopiujący wartości z `23:00` (to nie jest wymyślanie
danych — ta liczba opisuje blok trwający do północy, więc przedłużenie jej płasko przez ten blok jest
zgodne z jej znaczeniem). Wiersz zamykający jest wykluczony z tabeli godzinowej, z dymka, z podziałki
osi i z kropek alertów, każde miejsce sprawdzone osobno i przypięte testem. Po zmianie zmierzone
w przeglądarce: **rozjazd 0 px o 06, 12, 18, 19, 20 i 22**, krok godzinowy 11,583 px na obu osiach.

Świadomie zostawione: podziałki mają różny rytm — wykres opisuje co 4 godziny, pasek co 6, żeby
domknąć dobę liczbą 24. Decyzja właściciela po obejrzeniu zrzutu.

**Sprostowanie do akapitu wyżej (05.09.2026).** Tego samego dnia, kilka commitów po zapisaniu tamtej
notatki, blok alertów przebudowano na wariant **w4** („lista dociśnięta": godziny i margines w jednej
linii, wyrównane w kolumny; `6eebb4d`, tag `v3.65.0`), a mechanizm przełączania wariantów
`data-alerty` **usunięto z kodu produkcyjnego**. Oś doby (`w2`) i tabela (`w3`) żyją wyłącznie na
gałęzi `proto/alerty` i pozostają pracą odłożoną z warunkiem wyjęcia opisanym wyżej. Notatka opisuje
więc stan, którego aplikacja już nie ma — zostawiona dla historii decyzji, nie jako opis kodu.

## Kompas Energetyczny PSE w interfejsie (05.09.2026, v3.66.0–v3.68.0)

Sygnał `pdgsz` był pobierany i parsowany od dawna, ale **wyłącznie po stronie generatora tekstu** —
docierał do czytelnika tylko wtedy, gdy model napisał o nim zdanie. Teraz ma własne miejsce.

**Gdzie:** blok w karcie alertów pod listą (nagłówek pełną nazwą, stałe zdanie „Prośba operatora do
odbiorców — to nie jest przywołanie", wiersz `godziny · słowo operatora · stopień N`), pas pod
wykresem rezerwy na tej samej osi czasu, oraz jedna linia w karcie stanu **tylko wtedy, gdy flaga
obejmuje bieżącą godzinę**.

**Barwa: magenta** `#b5179e` / `#ff70c0` (kontrast 5,86:1 i 6,75:1). Wybrana, bo jest jedynym
odcieniem, który nie jest statusem, błękitem danych, indygo progu ani szarością — i nie ma
wyuczonego znaczenia sygnalizacji świetlnej, więc zmusza do przeczytania etykiety. Trzy kanały
niebarwne: pozycja (nad osią megawaty, pod osią prośba operatora), kształt (alert to kropka, Kompas
to pasek) i tekstura (stopień 3 pełny, stopień 2 kreskowany — poziom przeżywa druk i ślepotę barw).

**Czego Kompas nie dotyka, pilnowane testami** (`src/__tests__/compassIsolation.test.ts`): koloru
paska nagłówka, liczby na odznace aplikacji, `STATUS_THEME_COLOR`. To dyscyplina jednego pytania.

**Dwie pułapki, które kosztowałyby ciszę zamiast błędu:**
1. `scripts/visual.mjs` nie miał gałęzi dla `pdgsz`, a filtr Kompasu zawiera podciąg
   `business_date ge` — zapytanie wpadłoby w fiksturę prognozy, Kompas byłby niewidoczny na
   **wszystkich** wzorcach, a testy świeciłyby na zielono. Gałąź musi stać przed tamtą, tak jak
   `poze-redoze`.
2. Aplikacja podawała zakresy do panelu alertów, ale **nie do sekcji wykresu**, więc blok pokazywał
   flagę, a pas obok był pusty. Nic tego nie łapało, bo nic nie przechodziło przez granicę
   komponentów. Wykryte tylko dlatego, że po dodaniu widocznego elementu **żaden wzorzec się nie
   zmienił** — a to jest niemożliwe. Ogniwo pilnuje teraz test w `chartSection.test.tsx`.

**Pas pod wykresem — usunięty 05.09.2026, tego samego dnia.** Właściciel po obejrzeniu: „na wykresie
to dramat, nie chcę tego". Wycofany w całości (`CompassLane` i cały przelot propa), został w historii
pod tagiem `v3.68.0`, gdyby kiedyś wracać. Kompas ma odtąd **dwa** miejsca: linię w karcie stanu, gdy
flaga obejmuje bieżącą godzinę, i blok w karcie alertów. Wniosek: sam pomysł zestawienia prośby
operatora z najciaśniejszą godziną na jednej osi był słuszny analitycznie, ale na wykresie, który jest
już gęsty od pasm i linii, dołożenie czwartej rodziny znaków nie zadziałało wizualnie.

**Zasada operacyjna stąd:** odtworzenie wzorców, które nie zmienia ani jednego pliku po dodaniu
czegoś widocznego, jest sygnałem błędu, nie sukcesu.

## Badanie przywołań — podstrona robocza (06.09.2026, v3.70.0)

Właściciel miał **testowy okres przywołania 2026-09-02 na 20:00** i pytał, czy dało się to
przewidzieć z danych. Rama regulaminowa: wezwanie musi przyjść **co najmniej 8 godzin przed**
(`NOTICE_HOURS`), więc dla 20:00 termin to 12:00 — pytanie brzmi wyłącznie, co narzędzie wiedziało
**do 12:00 dnia D**. Godzina samego wezwania (11:14:59) jest terminem regulaminowym, nie momentem
w danych, i nie należy w niej niczego szukać.

**Bezpośredniego źródła nie ma.** Cały katalog `api.raporty.pse.pl` (90 zasobów): żaden nie
publikuje okresów przywołania ani testów; jedyna fraza „rynku mocy" to stały harmonogram godzin
szczytu (`cap_market_obligation`). Jawne zdarzenia istnieją dla nas tylko w ręcznym rejestrze
`data/przywolania.json` — właściciel dostaje je bezpośrednio jako CMU.

**Archiwum `pk5l-archiwum` jest jedynym miejscem, gdzie sygnał istnieje.** PSE oddaje dziś dla
02.09 20:00 rezerwę 857 MW (świat po interwencji); wartość 1162 MW sprzed zdarzenia jest tylko
u nas. To potwierdza sens archiwum, którego nie widać w produkcie.

**Sygnałem jest stan, nie zmiana.** Obalone, żeby nie wracało:
- „aktualizacja danych na 20:00" — poranna rewizja w dół to norma (6 z 8 dób), a 02.09 miała
  z nich **najmniejszą** (−228 MW; 01.09: −854); była dobą najspokojniejszą;
- próg 1100 MW — pierwsze zejście poniżej o 20:07, po rozpoczęciu; to skutek, nie ostrzeżenie;
- pasmo 1100–1200 MW — dopasowane do jednego przypadku; 07 i 08.09 mają rezerwę poniżej 1100
  i by w nie nie weszły;
- liczba godzin z ujemnym marginesem — odstęp zero (31.08 i 01.09 też 4).

**Cztery cechy z okna decyzyjnego, każda z uzasadnieniem niezależnym od próbki:** zapas nad
1100 MW (02.09: +7, druga doba +416 — próg, według którego operator decyduje), **dwell**
(rozpiętość nieprzerwanego ciągu poniżej 1500 MW do okna decyzyjnego, teraz liczona w godzinach,
nie w liczbie odczytów: dla 02.09 ok. 17–20 h wobec 0 wszędzie indziej — trwałość niedoboru, nie
mrugnięcie), margines wieczorem D−1 (−488, jedyny ujemny),
Kompas L2 na najgorszej godzinie w wersji **aktywnej w oknie** (31.08 i 03.09 dostały flagę dopiero
po południu — liczy się wersja z chwili, nie ostatnia).

**Uczciwie: jeden przypadek pozytywny.** Każda cecha, w której 02.09 jest ekstremum, da separację
7/7 — to arytmetyka, nie wynik. Dlatego podstrona pokazuje **wartości ciągłe i percentyle**, nie
progi; werdykt liczy ekstrema, nie porównuje z liczbą dobraną po zobaczeniu danych. **Rozstrzygną
07, 08 i 09.09** — wszystkie cztery cechy strzelają tam mocniej niż 02.09 (09.09: zapas +40,
dwell dłuższy — w godzinach, przeliczone z dawnej liczby odczytów). Brak przywołania w tych dobach
= cechy za luźne; choć jedno = pierwszy niezależny dowód.
Właściciel wpisuje wynik do rejestru.

**Definicja, która o mało nie podglądnęła przyszłości.** Pierwsza wersja wybierała najgorszą godzinę po
jej *najnowszym* odczycie — dla 02.09 to 857 MW z odczytu po zdarzeniu. Poprawiona reguła: każda
godzina 12–23 ma własne okno decyzyjne i wybieramy tę z najniższą rezerwą **w jej oknie**; zdarzenie
z rejestru wymusza swoją godzinę. Bez zdarzenia 02.09 wybrałoby h19 (1141 MW) zamiast h20 (1142 MW)
— różnica 1 MW, co samo w sobie mówi, jak płaski był ten wieczór. Praca podzielona na trzech agentów
równolegle (worktree), stąd jeden tag zamiast trzech.

**Budowa, bez dotykania głównego ekranu:** generator liczy `data/badanie.json` (`src/utils/badanie.ts`,
kontrakt `badanieTypes.ts`); plik leży w `data/`, które workflow commituje, ale wdrożenie jest
bramkowane tylko `summary.json` — więc **nie ma deployu ani churnu service workera**. Podstrona
`/#badanie` (gałąź w `main.tsx`, `App.tsx` nietknięty) pobiera go z `raw.githubusercontent.com`
(CORS `*`, cache 5 min). Kompas archiwizowany odtąd w `data/kompas-archiwum/` wg wzorca
`pk5lArchive`, z jednorazowym zasileniem historią wersji z `pdgsz`.

**Zapis obserwacji przez GitHub Issues (06.09.2026).** Właściciel chce oznaczać na podstronie, co
faktycznie było w dobie: „u nas nic", test albo przywołanie z godziną i zakresem. Strona nie ma
backendu i **nie może trzymać tokenu** (zasada: token widzi wyłącznie cron-job.org). Dlatego strona
buduje gotowy link „new issue" z tytułem w stałym formacie (`src/utils/obserwacje.ts`:
`[badanie] 2026-09-07 nic` / `[badanie] 2026-09-07 20:00 test jednostka`), właściciel naciska
„Submit" zalogowany do GitHub, a generator co 15 minut czyta Issues (`GITHUB_TOKEN` z Actions,
`issues: read`) i wpisuje obserwacje do `badanie.json` — czytanie Issues jedzie w tym samym
przebiegu co reszta generatora, nie na osobnym harmonogramie, więc poszło z nim razem na kadencję
kwartalną. (Komentarz w `src/utils/obserwacje.ts` mówiący o „hourly generator" jest z tego samego
powodu nieaktualny — poza zestawem plików tej poprawki.) Rejestr ręczny ma pierwszeństwo per data.
Issues są zarazem miejscem rozmowy o dobie — „będziemy mieli o czym rozmawiać".

**Ograniczenie, którego nie da się usunąć:** „u nas nic" znaczy „nic w naszych jednostkach". Test
w jednostce innego agregatora jest dla właściciela niewidoczny, więc „nic" na dobie z alarmem to
**górne oszacowanie** fałszywego alarmu, nie dowód. Prawdziwe przywołanie całego rynku widzą wszyscy
— tam „nic" jest pewne. Kalibracja cech opiera się wyłącznie na tym, co właściciel może zobaczyć.

**Regulamin: test a okres przywołania — i korekta „nie ma źródła" (06.09.2026).**
Rozporządzenie z 19.09.2024 (Dz.U. 2024 poz. 1389) i Regulamin Rynku Mocy (pkt 16.3, 16.8):
- **Okres przywołania** (§4–§6): operator ogłasza go, gdy w bilansowaniu dobowym nadwyżka mocy
  osiągalnej netto ponad zapotrzebowanie jest **mniejsza niż wymagana**; może odstąpić, gdy nadwyżka
  **nie jest niższa niż 1100 MW** i nie widzi zagrożenia. Tylko godziny 7–22 w dni robocze. Dotyczy
  wszystkich jednostek z obowiązkiem. Ogłoszenie **≥ 8 h przed** (16.3.2.5: późniejsze uznaje się
  za niebyłe) — na stronie PSE, w rejestrze, mailem i SMS-em.
- **Testowy okres przywołania** (§12 ust. 3; 16.8): dla **wybranych** jednostek, **nie częściej niż
  raz na kwartał** na jednostkę (po wyniku negatywnym — kolejne aż do pozytywnego), **jedna
  dowolna godzina wybrana przez operatora** z 7–22, ogłoszenie ≥ 8 h przed, **tylko przez rejestr,
  mail i SMS — nie na stronie PSE** (16.8.1.3 odsyła do 16.3.2.1 pkt 2 i 3, z pominięciem pkt 1).
  Wynik pozytywny = dostarczona moc ≥ obowiązek w tej godzinie; negatywny = kara (17.2.4).
  Dostawca może sam **wnioskować o test**, gdy w dwóch pierwszych miesiącach kwartału nie było
  ani testu, ani przywołania (§13 ust. 3) — test służy demonstracji zdolności (§12 ust. 2).
- **Wniosek dla badania:** cechy z okna decyzyjnego (zapas nad 1100, margines, dwell) są
  **wprost zakotwiczone w regulaminie dla okresu przywołania**. Dla **testu regulamin nie daje
  żadnego powodu, by rezerwa miała znaczenie** — godzinę wybiera operator. Zbieżność testu 02.09
  z ciasną dobą to hipoteza o praktyce PSE (testować wtedy, gdy moc i tak jest potrzebna), nie
  reguła. Dlatego w rejestrze `kind` rozróżnia test od przywołania i oba są liczone osobno.
- **Korekta:** API nie ma źródła, ale **strona PSE ma tabelę ogłoszonych okresów przywołania**
  (`pse.pl/rynek-mocy-okresy-przywolania`, szczegóły na `purm.pse.pl`): 16 godzin, w tym
  **30.06.2026 18–22, 04.08.2026 17–19, 06.08.2026 17–22** (prawdziwe, całorynkowe) oraz
  23.09.2022, 06.11.2024. Kolumny: P_OP (zapotrzebowanie), P_RM (wymagana nadwyżka ≈ 2000 MW,
  zgodna z `req_pow_res`), W_NJRM, ΣOM, UR_JRM, α_SOM. Testów tam nie ma — zgodnie z 16.8.1.3.
  Do zrobienia: zaciągać tę tabelę do rejestru automatycznie (zdarzenia `real`); doby z sierpnia
  są sprzed archiwum (od 28.08), więc okna decyzyjnego dla nich nie odtworzymy.
- 16.3.1.1: OSP publikuje prognozy zapotrzebowania, mocy dyspozycyjnej, niedyspozycyjności,
  generacji poza rynkiem mocy i sumy obowiązków — w cyklu rocznym, miesięcznym, tygodniowym
  i dobowym. Warto sprawdzić, czy są w API pod inną nazwą niż `pk5l-wp`.

**Zastrzeżenia właściciela do badania (07.09.2026, v3.73.1).** „Widzę tylko jedną godzinę na dobę",
„nie mogę zaznaczyć godziny testu", „dane poprawiają się sporo po dodaniu eksportu/importu, dość
późno". Odpowiedź w kodzie: zakres godzin docelowych i formularza **7–21** (rozporządzenie §6: okresy
tylko w blokach 7:00–22:00; dotąd 12–23, co wykluczało poranek — 03.09 dostało 07:00 z 1813 MW);
pola godziny i zakresu w formularzu zawsze widoczne, wyszarzone przy „u nas nic"; w rozwinięciu
doby lista **innych godzin z ujemnym marginesem w ich własnym oknie**; archiwum `pk5l` ma **siódmą
kolumnę `plannedExchange`** (dedupe po `(surplus, required, plannedExchange)`, więc rewizja samego
salda też zostaje zapisana), a oś odczytów pokazuje saldo i pogrubia moment jego zmiany. Hipotezy
o wymianie nie da się sprawdzić wstecz — od 07.09 16:30 archiwum ją rejestruje; po kilku dobach
porównać skoki rezerwy (jak 07.09 o 13:19, +2700 MW) ze zmianą salda w tym samym odczycie.

**Saldo wymiany: hipoteza właściciela potwierdzona (07.09.2026, v3.74.0).** Odczyt PSE 07.09 16:32:
dziś i jutro saldo prawdziwe, zmienne co godzinę (+1,9–3,3 GW importu w szczycie); doby od pojutrza
do D+9 — stałe **−12 MW** na wszystkich godzinach, dalej 0. To placeholder sprzed rynku dnia
następnego; saldo doby D dochodzi w D−1 około 13:00 (06.09 13:19: +2700 MW dla 07.09; 01.09 13:59
dla 02.09). Rezerwa dób od pojutrza jest więc liczona **bez salda** (09.09: 49 MW na 19:00); dotąd plan
przynosił import, ale właściciel słusznie zauważył, że eksport przesunąłby ją w dół — teksty na
ekranie i dla modelu nie przesądzają kierunku ani wielkości (v3.74.1).
Wykrywanie z danych, nie z zegara: `src/utils/exchangePlan.ts` — doba ma plan, gdy 24 godziny mają
≥ 2 różne wartości salda; odczyt archiwum ma saldo, gdy |saldo| > 15 MW (`null` = sprzed kolumny
= traktowany jako planowany). Skutki: (1) podstrona — dwell liczony tylko z odczytów po saldzie
(placeholder przerywa ciąg), doby „otwarte · bez salda", odczyty „przed saldem", zdanie nad
„Przed nami"; (2) główny ekran — jedno zdanie w bloku alertów dla wybranej doby bez planu
(statusy i progi bez zmian; fikstura scen ma zmienne saldo, więc wzorce wizualne nietknięte);
(3) fakty AI — zdanie o braku salda dla takich dób, `13:00` dopuszczone w walidatorze, prompt 52.
Okno decyzyjne (12:00 dnia D) leży po dodaniu salda, więc cechy z okna są uczciwe; 02.09 dwell
19,0 h bez zmian (ciąg zaczął się po saldzie). **Pomiar po kilku dobach:** czy skok salda zawsze
przychodzi w tym samym oknie ~13:00 (archiwum od 07.09 16:30 ma kolumnę salda). **Potwierdzone
09.09, trzecim pomiarem:** 01.09 o 13:59 (dla 02.09), 06.09 o 13:19 (dla 07.09), 08.09 o 13:15
(dla 09.09) — doba D dostaje prawdziwe saldo zawsze po południu D−1, w oknie kilkunastu minut
wokół 13:00.

**Kompas na prawdziwych przywołaniach (07.09.2026, v3.75.0).** Historia wersji `pdgsz` istnieje od
06.2024, więc cechę Kompasu dało się sprawdzić na czterech prawdziwych, całorynkowych okresach
przywołania z tabeli PSE (`pse.pl/rynek-mocy-okresy-przywolania`): 06.11.2024 (16–19; jedna wersja,
PSE wtedy nie wersjonowało, h17–18 L2), **30.06.2026** (18–22: h18 L2, h19 **L3**, h20 L2, h21 L1),
**04.08.2026** (17–19: h17 L2, h18 L1 — L2 istniało od 03.08 14:00 i zostało cofnięte przed
terminem), **06.08.2026** (17–22: h17–18 L2, h19–21 L1). Wersja = aktywna 8 h przed daną godziną.

**Tło, 70 dni roboczych 01.06–06.09.2026, godziny 7–21:** L2+ w wersji aktywnej przed terminem na
jakiejkolwiek godzinie miało **16 dni**, w tym **wszystkie 3 przywołania i test 02.09** → warunek
konieczny 4/4, precyzja 4/16. Doby z flagą bez zdarzenia w naszym rejestrze: 18.06 (L3 h20–21),
24.06, 26.06, 15–17.07, 31.07, 03.08, 17–19.08, 01.09 — kandydaci do sprawdzenia u właściciela,
czy nie było wtedy testów w innych jednostkach. Flaga „L2+ w jakiejkolwiek wersji do terminu" ma
33/70 — bezużyteczna; potwierdza definicję „wersja aktywna w chwili okna". Wezwane godziny nie
zawsze są flagowane pojedynczo, dlatego cecha przechodzi z godziny docelowej na **dobę** (dowolna
godzina 7–21 w wersji aktywnej przed terminem tej godziny); `ALARM_FROM` bez zmian — Kompas jest
filtrem koniecznym, nie alarmem.

**Testy 2026 z relacji właściciela (07.09) — bez kodów jednostek, tylko daty i godziny.** Pięć dób
testowych; Kompas w wersji aktywnej przed terminem na godzinie testu, godziny L2+ w dobie, i końcowa
prognoza (po fakcie, z importem — obciążona w dół interwencją, więc tylko orientacyjnie):

| doba | godzina testu | wezwania | Kompas na h (aktywna) | L2+ w dobie | rezerwa/wymagana po fakcie |
|---|---|---|---|---|---|
| 10.06 | 20:00 (×2) i 21:00 | 10:44–11:33 | L1 / L1 | — | 2281/1810 (+471), 2601/1753 (+848) |
| 22.06 | 20:00 | 10:55 | L1 | — | 2763/1900 (+863) |
| 16.07 | 20:00 (×2) | 10:23, 10:53 | L1 | 14–16 (południe) | 3289/1824 (+1465) |
| 24.08 | 21:00 | 11:12 | L1 | — | 1449/1820 (**−371**) |
| 02.09 | 20:00 | 11:15 | **L2** | 18–20 | 857/1995 (−1138) |

**Wniosek dla testów: nie zależą od stanu systemu.** Kompas na godzinie testu flagował 1 z 5 dób;
margines po fakcie ujemny w 2 z 5. Regulamin („dowolna godzina wybrana przez operatora") jest
zgodny z danymi. Dwie prawidłowości praktyki, które dane pokazują: **testy zawsze na 20:00 lub
21:00** (szczyt wieczorny — sprawdzają moc wtedy, gdy byłaby potrzebna) i **wezwania między 10:20
a 11:35**, czyli tuż przed regulaminowym terminem. Dla prawdziwych przywołań bez zmian: 3/3 w dobach
z flagą Kompasu i z niedoborem. **Badanie przewiduje przywołania; testów nie przewidzi i podstrona
nie powinna tego obiecywać** — werdykty dla dób z `kind: test` liczą się osobno.

**Historii prognozy `pk5l-wp` w API nie ma — sprawdzone ponownie 07.09:** 24 wiersze na dobę,
każdy w ostatniej wersji; filtr po `publication_ts_utc` zwraca tylko godziny o wcześniejszej
ostatniej rewizji, nie starsze wersje. Nasze archiwum pozostaje jedynym zapisem stanu w czasie.

**Archiwum Kompasu zasilone wstecz** do 01.06.2026 (partycje 2026-05…08, ~74 tys. wierszy, ~5,3 MB,
jednorazowo; wiersze starsze wpisane przed istniejącymi, żeby „późniejsza linia wygrywa" pozostało
prawdą). Rejestr `data/przywolania.json` ma cztery prawdziwe zdarzenia (`real`, `market`, `hour` =
pierwsza wezwana godzina, zakres w notatce); doby sprzed archiwum prognozy nie mają okna
decyzyjnego i pojawiają się tylko w stopce podstrony.

**Trzecia kolumna: próba 1536 px odrzucona, zostaje 1760 px (09.09.2026, v3.76.0 → v3.76.1).**
Właściciel: „tych 3 kolumn na komputerze nie trafiłem jeszcze ani razu" — próg 110rem (1760 px) był
dobrany pod monitor 1920, a żaden MacBook tam nie sięga (14" = 1512 px, 16" = 1728 px). Próba z
96rem (1536 px) na 14" w trybie „więcej miejsca" dała kolumnę wykresu ~450 px; werdykt: „na 14 calach
słabo to wygląda, od 24 cali w górę" — **110rem wraca jako decyzja**, nie przypadek. Z próby zostały
dwie rzeczy: zakładki dób i widoków miały sztywne 34rem i przy wąskiej kolumnie nachodziły na kartę
marginesu — teraz `xl:w-full xl:max-w-[34rem]`, kurczą się z kolumną (błąd niezależny od progu); oraz
scena strażnika `laptop-light` (1536×982), która pilnuje, że laptop dostaje dwie kolumny bez
nachodzenia. Test źródłowy `tabsShrinkWithColumn` pinuje klasy i próg 110rem. Sceny 1920 bez zmian.

**Przycisk „Odśwież" znika w zwykłej przeglądarce na komputerze (09.09.2026, v3.77.0).** Właściciel:
„na Windows mnie drażni". Dane odświeżają się same co 15 min, więc przycisk nie jest o świeżość,
tylko o dostępną drogę tam, gdzie przeglądarka jej nie daje: zainstalowana aplikacja (brak F5),
ekran dotykowy (gest działa tylko od góry strony, czytnik ekranu nie zrobi gestu). Hook
`useRefreshButton`: pokazuj, gdy `display-mode: standalone`, `navigator.standalone` (Safari),
`pointer: coarse` albo `maxTouchPoints > 0`; bez `matchMedia` — pokazuj (bezpieczna strona).
**Decyzja raz, przy montowaniu, bez nasłuchu zmian mediów** — pierwsza wersja nasłuchiwała i przycisk
znikał w strażniku podczas zrzutu całej strony (Chromium chwilowo przelicza metryki urządzenia,
`pointer: coarse` przełączało się na klatkę, nasłuch chował przycisk tuż przed przechwyceniem);
realny użytkownik mógłby to zobaczyć jako miganie przy zmianie okna. Ekran błędu w `main.tsx`
zachowuje przycisk zawsze (test źródłowy `refreshButtonWiring`). Sześć wzorców pulpitu przepisanych,
dwanaście scen telefonu bez zmian.

**Adres z hashem zostaje — decyzja właściciela (06.09.2026).** Prawdziwa ścieżka `/badanie/` jest
wykonalna (drugi plik wejściowy Vite + wyjątek `navigateFallbackDenylist` w service workerze, bo
zainstalowana aplikacja przechwyciłaby nawigację i podała główny ekran), ale nie jest potrzebna.
Nie proponować ponownie.

## Kadencja 15 minut i zaległości (06.09.2026, v3.73.0)

**Co zmieniono i dlaczego.** Trzy podsystemy podniesione naraz, bo dotyczą tej samej zmiany
częstotliwości:
- `scripts/summary.ts` uruchamia się teraz **co 15 minut** — cron-job.org wywołuje
  `repository_dispatch`, a `schedule '37 * * * *'` w `summary.yml` zostaje jako **awaryjna druga
  szansa**, gdyby zewnętrzne wywołanie zawiodło.
- `forecastLog.ts` liczy ruch i ustalanie prognozy na serii **przepróbkowanej do godziny**
  (ostatnia migawka w każdej godzinie zegarowej) — dzięki temu progi `MOVEMENT_MIN_SNAPSHOTS`
  i `SETTLING_WINDOW` zachowują znaczenie „12 godzin" niezależnie od tego, ile migawek faktycznie
  wpadło w daną godzinę. Limit logu zmienił się z 72 wpisów na **okno 72 godzin** z sufitem
  400 wpisów.
- `badanie.ts` liczy **dwell w godzinach** (rozpiętość nieprzerwanego ciągu poniżej 1500 MW do
  okna decyzyjnego), a nie w liczbie wpisów — żeby doby sprzed zmiany kadencji i po niej były
  porównywalne.

**Czy baza wytrzyma.** Rotacja `data/pk5l-archiwum/` nie jest planowana — plik rośnie wyłącznie
przez dopisywanie. To świadoma decyzja: archiwum jest źródłem prawdy do liczenia trafności
narzędzia, a skracanie go odbierałoby tę możliwość. Przyrost mierzony przy poprzedniej kadencji to
ok. 1,6 MB miesięcznie (ok. 19 MB rocznie); dedupe po wartości ogranicza, o ile więcej doda
kadencja co 15 minut — szacowany mnożnik przyrostu to rzędu 1,5–3×, nie szesnastokrotny.
**(Liczba nieaktualna, i to nie tylko z powodu kadencji — zmierzone 09.09: patrz „Kadencja 15
minut — pomiary pierwszej doby" niżej, rzeczywisty przyrost wychodzi bliżej 13 MB miesięcznie.)**

**Limit Gemini.** Model jest pytany tylko przy zmianie oceny albo po 6 godzinach (`decideRun`,
`MAX_STALE_MS`), więc górna granica to 96 przebiegów generatora na dobę × 2 próby = 192 wobec
RPD 500. Dziś zmierzone 54/500 — ale przy poprzedniej kadencji co godzinę (24 przebiegi na dobę),
więc ta liczba nie odzwierciedla nowego reżimu i pomiar wymaga powtórzenia.

**Pomiary do zrobienia po 24 h od przełączenia:**
- czas trwania joba i zachowanie kolejki `concurrency: summary` przy kadencji co 15 minut —
  zmierzone 09.09, patrz „Kadencja 15 minut — pomiary pierwszej doby" niżej
- RPD i RPM Gemini w nowym reżimie — wciąż nie zmierzone
- przyrost `data/*.jsonl` i `data/badanie.json` — zmierzone 09.09, patrz sekcja niżej
- ewentualne HTTP 429 z API PSE — wciąż nie zaobserwowane ani nie sprawdzone celowo

**Zaległości, wykonane w tym samym zestawie zmian:** strzałki, Home i End w `SegmentedControl`
(roving tabindex); `role="status"` i `aria-live="polite"` na odznace statusu w
`CurrentStatusCard`; usunięcie martwych pól `text`/`textSecondary`/`warn` z `useChartColors`;
testy dla siedmiu hooków — `useOnlineStatus`, `usePersistentFlag`, `useTheme`,
`useThemeColorMeta`, `useKseDemand`, `useInstallPrompt`, `useHistory`.

**Odłożone dalej, z powodem:**
- walidator liczb słownych — leży w walidacji tekstu modelu, a lista słów-liczb odrzucałaby zwykłe
  zdania; ryzyko dla tekstu na głównym ekranie.
- `proto/alerty` — warunek osi (rozjazd toru alertów z polem wykresu) bez zmian, warunek wyjęcia
  opisany wyżej wciąż obowiązuje.
- gałąź `feat/gest-sledzacy-palec` — cztery naprawy do wyjęcia z commitu, osobna decyzja.

**PAT do cron-job.org wygasa 28.09.2026.** Odnowienie leży po stronie właściciela; token nie trafia
do czatu, repozytorium ani żadnego pliku.

## Kadencja 15 minut — pomiary pierwszej doby (09.09.2026)

Odpowiedź na listę „Pomiary do zrobienia po 24 h" w sekcji wyżej — pierwsza pełna doba na
kwadransach, 08–09.09.

**Czas trwania joba.** Doba 08–09.09: **95 przebiegów, 92 udane i 3 nieudane**, mediana **63 s**,
maksimum **295 s**, łącznie **101 minut** czasu Actions. Wszystkie trzy nieudane padły na kroku
zapisu do repozytorium — naprawa jest **w toku**, jako osobne zadanie, nie zrobiona przy okazji tego
pomiaru.

**Przyrost archiwum `pk5l`.** `data/pk5l-archiwum/2026-09.jsonl` waży 3,8 MB po dziewięciu dniach,
czyli około **13 MB miesięcznie** — liczba 1,6 MB podana w sekcji wyżej była błędem pomiaru, nie
tylko wartością sprzed zmiany kadencji. Linii na dobę: 8991 (06.09, jeszcze kadencja godzinowa) →
17843 (08.09, pełna doba na kwadransach), czyli około **2×, nie 4×** — dedupe po `(surplus,
required, plannedExchange)` działa. Bajty rosną szybciej niż linie, bo siódma kolumna dodana w
v3.73.1 sama coś waży i sama bywa tym, co odróżnia kolejny wiersz od poprzedniego. Archiwum Kompasu,
prowadzone tym samym mechanizmem: partycje **~1,7 MB miesięcznie** po zasileniu wstecz.

**`forecast-log.json`.** 231 kB, 268 wpisów, rozpiętość 71,1 h — poniżej sufitu 400 wpisów i w
granicach okna 72 h, więc mechanizm z poprzedniej sekcji działa zgodnie z projektem.

**`data/badanie.json`.** 121 kB.

**Saldo wymiany.** Wzorzec „doba D dostaje prawdziwe saldo po południu D−1" potwierdzony trzecim
pomiarem: 01.09 o 13:59 (dla 02.09), 06.09 o 13:19 (dla 07.09), 08.09 o 13:15 (dla 09.09) — zawsze
w oknie kilkunastu minut wokół 13:00.

**Wciąż nie zmierzone:** RPD i RPM Gemini w nowym reżimie, HTTP 429 z API PSE.

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
