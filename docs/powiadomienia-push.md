# Powiadomienia push o alarmach — projekt zaparkowany

Zaprojektowane i zmierzone 2026-08-03, **nie zaimplementowane**. Dokument istnieje po to, żeby
przy powrocie do tematu nie odtwarzać analizy od zera.

## Problem

Aplikacja nigdy sama o niczym nie informuje. W kodzie nie ma `Notification` ani `PushManager`;
dzwonek w nagłówku wycisza wyłącznie komunikaty wewnątrz aplikacji, a odznaka na ikonie
aktualizuje się tylko wtedy, gdy aplikacja jest uruchomiona. O alarmie dowiesz się dopiero po jej
otwarciu.

## Ile realnie byłoby powiadomień

Pomiar na danych PSE z 33 dni (792 godziny), próg alarmowy 300 MW:

| | wartość |
|---|---|
| godzin z alarmem | 92 |
| ciągłych bloków | 28 |
| po scaleniu przerw ≤ 1h | **25 zdarzeń** (~5,3/tydzień) |
| maks. w jednym dniu | 2 (tylko 3 dni na 33 miały >1) |
| długości bloków | 1h×7, 2h×4, 3h×7, 4h×2, 5h×4, 6h×2, 8h×2 |
| dni z jakimkolwiek alarmem | 22 z 33 |

Najważniejsza konsekwencja: **ciąg pięciu godzin alarmowych to jedno zdarzenie**. Bez sklejania
w bloki byłyby 92 powiadomienia miesięcznie zamiast 25. Ponieważ jednak alarmy zdarzają się
w dwóch trzecich dni, poranne podsumowanie *plus* przypomnienie przed każdym zdarzeniem dałoby
~10 tygodniowo — dlatego przypomnienie musi być warunkowe.

## Architektura bez serwera

Nic nie musi działać w sposób ciągły, więc backend jest zbędny. Wystarczy coś, co obudzi się
cyklicznie, sprawdzi dane i wyśle — a to potrafi GitHub Actions, którego projekt już używa.

```
GitHub Actions (cron co 30 min, TZ=Europe/Warsaw)
   ├─ pobiera dane z PSE            (fetchPSEData     z src/utils/api.ts)
   ├─ liczy zdarzenia alarmowe      (findAlerts +
   │                                 buildAlertRanges z src/utils/dataTransform.ts)
   ├─ porównuje ze stanem z poprzedniego uruchomienia
   └─ wysyła Web Push (VAPID) prosto do serwera Apple → telefon
```

Skrypt powiadomień **importuje te same funkcje co aplikacja** — to czyste funkcje bez zależności
od DOM, więc logika progów nie rozjedzie się między telefonem a workflow. Uruchamiany przez `tsx`.

Sekrety i konfiguracja:
- `VAPID_PRIVATE_KEY` — sekret repozytorium
- `PUSH_SUBSCRIPTION` — sekret repozytorium, JSON subskrypcji telefonu
- `VITE_VAPID_PUBLIC_KEY` — zmienna repozytorium, wstrzykiwana do bundla przy buildzie

Stan między uruchomieniami (co już wysłano) w jednym pliku JSON na osobnej gałęzi `notify-state`.
Świadomie nie `actions/cache` — cache bywa usuwany, co oznaczałoby powtórzone powiadomienia.

Ciche godziny liczy skrypt, a nie harmonogram cron: cron działa w UTC, więc przy zmianie czasu
godziny rozjechałyby się dwa razy w roku.

## Reguły wysyłki

Kolejność ma znaczenie:

1. **Ciche godziny** — między 22:00 a 07:00 nic nie wychodzi; zdarzenia trafiają do kolejki
   porannej.
2. **Podsumowanie 7:00** — raz dziennie, tylko gdy na dziś są zdarzenia. Treść w rodzaju
   „Dziś 2 okna alarmowe: 06:00–09:00 (−40 MW), 20:00–23:00 (−155 MW)". Zapamiętuje wysłane
   zdarzenia i najniższy margines każdego z nich.
3. **Przypomnienie ~1h przed** — wyłącznie gdy zdarzenie nie było w porannym podsumowaniu albo
   jego margines pogorszył się o więcej niż 100 MW względem wartości porannej.
4. **Jedno powiadomienie na zdarzenie** — dedupe po identyfikatorze (`businessDate` + godzina
   startu) w pliku stanu.
5. Zdarzenia z przeszłości usuwane ze stanu, żeby plik nie rósł.

## Zmiany w aplikacji

### Service worker

Największa zmiana techniczna. `vite.config.ts` używa dziś strategii `generateSW`, która nie
pozwala dołożyć własnych procedur obsługi. Trzeba przejść na `injectManifest` i własny `src/sw.ts`:
obsługa `push`, obsługa `notificationclick`, **oraz zachowanie dotychczasowego automatycznego
aktualizowania** (`skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`) — tylko dzięki niemu
nowe wersje wchodzą na telefon bez reinstalacji, więc jego zepsucie odcięłoby drogę dostarczania
kolejnych poprawek.

Żadnego cichego push: Safari na iOS wymaga, by każde odebrane powiadomienie zostało faktycznie
wyświetlone, a pominięcie `showNotification` grozi odebraniem uprawnienia. Dlatego filtrowanie
dzieje się po stronie workflow, nie w service workerze.

### Włącznik i wyłącznik

Hook `usePushSubscription`: stany `unsupported` / `denied` / `off` / `on`; włączenie przez
`Notification.requestPermission()` z gestu użytkownika i `pushManager.subscribe()`.

**Wyłącznik działa naprawdę:** po `unsubscribe()` serwer Apple odpowiada `410 Gone`, workflow to
wykrywa, oznacza subskrypcję jako martwą i przestaje wysyłać. To nie jest atrapa ukrywająca
powiadomienia lokalnie.

Dzwonek w nagłówku przestaje wyciszać komunikaty wewnętrzne i staje się skrótem do tego samego
przełącznika — jeden spójny sens zamiast dwóch różnych „powiadomień".

## Dwa ograniczenia, które trzeba zaakceptować

**Jednorazowa czynność ręczna.** Po włączeniu powiadomień aplikacja pokazuje subskrypcję do
skopiowania; trzeba ją raz wkleić do sekretu `PUSH_SUBSCRIPTION`. Bez backendu nie ma gdzie
przyjąć jej automatycznie.

**Obsługa tylko własnych urządzeń.** Ktoś inny, kto doda aplikację do ekranu głównego, powiadomień
nie dostanie — jego subskrypcja nie ma jak trafić do sekretu. Obsługa wielu osób wymagałaby
backendu z magazynem subskrypcji.

## Wymagania po stronie iOS

Web Push działa wyłącznie w aplikacji **dodanej do ekranu głównego** i wymaga iOS 16.4+.
W zwykłej karcie Safari nie zadziała. Gdy warunek nie jest spełniony, przełącznik powinien
wyjaśnić dlaczego, zamiast po cichu nie działać.

## Alternatywa rozważana i odrzucona

Cykliczny workflow wysyłający do gotowej usługi (ntfy.sh, Pushover, Telegram) — zero kluczy VAPID,
zero magazynu subskrypcji, zero zmian w service workerze. Odrzucona, bo powiadomienie przychodzi
wtedy z obcej aplikacji, a nie z ikony PSE Dashboard. Warta powrotu, gdyby przejście na
`injectManifest` okazało się zbyt ryzykowne.
