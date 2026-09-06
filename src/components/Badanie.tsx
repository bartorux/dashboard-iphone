import { useEffect, useState } from 'react';
import {
  BadanieFile,
  CallEvent,
  DayStudy,
  Feature,
  Verdict,
} from '../utils/badanieTypes';
import { formatMW, signedMW } from '../utils/format';

/**
 * Research subpage, not the product. Reachable only at `#badanie` (see
 * utils/route.ts + main.tsx) — nothing on the main screen links here, and
 * nothing here feeds back into it. The owner's own words: "dopóki nie mamy
 * dokładnych danych, nie wdrażamy tego na ekran główny; podstrona może nawet
 * wyglądać jak gówno" — so this file spends zero effort on layout and reuses
 * whatever Tailwind tokens already exist in App.css, none of them new.
 *
 * Reads a file a separate generator writes (contract: badanieTypes.ts) — this
 * page never computes a verdict, it only displays one that was already
 * computed, exactly like SummaryCard reads summary.json rather than writing
 * its own prose.
 */

// Exported so the test can pin it: this is the one thing that must never
// silently drift to a different branch or repo.
export const BADANIE_URL =
  'https://raw.githubusercontent.com/bartorux/dashboard-iphone/react/data/badanie.json';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: BadanieFile };

const VERDICT_WORD: Record<Verdict, string> = {
  trafienie: 'trafienie',
  'falszywy-alarm': 'fałszywy alarm',
  przeoczenie: 'przeoczenie',
  cisza: 'cisza',
  otwarte: 'otwarte',
};

const EVENT_KIND_WORD: Record<CallEvent['kind'], string> = {
  test: 'test',
  real: 'przywołanie',
};

const EVENT_SCOPE_WORD: Record<CallEvent['scope'], string> = {
  unit: 'jedna jednostka',
  market: 'cały rynek',
};

function formatEvent(event: CallEvent): string {
  return `${EVENT_KIND_WORD[event.kind]}, ${EVENT_SCOPE_WORD[event.scope]}`;
}

/** "2026-09-02" -> "02.09". Parsed by hand rather than through `new Date`,
 *  same reasoning as dateHelpers' UTC-anchored parsing: a business date is a
 *  calendar label, and building it through local midnight could roll it back
 *  a day for a reader west of the data. */
function formatDayDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}.${match[2]}` : date;
}

/** An ISO instant, as the reader's own clock would show it. */
function formatLocalTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function formatLocalDateTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const date = parsed.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const time = parsed.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function formatPercentile(percentile: number | null): string | null {
  if (percentile === null) return null;
  return `p ${percentile.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * One feature cell: value, and — when the file has one — the percentile that
 * says how it ranks against every other closed day. Highlighted the same way
 * an alert row is elsewhere in the app (bg-alarm-soft/text-alarm-text): an
 * extreme feature is the same kind of fact as an active alert, just measured
 * after the day closed instead of while it is happening.
 */
function FeatureCell({
  feature,
  format,
}: {
  feature: Feature;
  format: (value: number) => string;
}) {
  const percentileLabel = formatPercentile(feature.percentile);
  return (
    <td
      className={`px-2 py-1.5 text-right tnum ${
        feature.extreme ? 'bg-alarm-soft text-alarm-text' : ''
      }`}
    >
      <div>{feature.value === null ? '—' : format(feature.value)}</div>
      {percentileLabel && (
        <div className="text-[0.6875rem] text-text-secondary">{percentileLabel}</div>
      )}
    </td>
  );
}

/**
 * The day's timeline, shown only once its date row is expanded.
 * `dwellFloorMw` lives on the file, not the day, so it is passed in rather
 * than read off `day` itself.
 */
function ReadingsList({ day, dwellFloorMw }: { day: DayStudy; dwellFloorMw: number }) {
  return (
    <ol className="space-y-1 py-2 pl-1 text-[0.8125rem]">
      {day.readings.map(([readAt, surplus, required]) => {
        const isWindow = readAt === day.window.readAt;
        const margin = surplus - required;
        const belowFloor = surplus < dwellFloorMw;
        return (
          <li
            key={readAt}
            className={`tnum ${isWindow ? 'font-semibold' : ''} ${
              belowFloor ? 'text-warn-text' : ''
            }`}
          >
            {formatLocalDateTime(readAt)} — rezerwa {formatMW(surplus)} MW, wymagana{' '}
            {formatMW(required)} MW, margines {signedMW(margin)}
            {isWindow && ' (okno)'}
          </li>
        );
      })}
    </ol>
  );
}

function DayRow({
  day,
  dwellFloorMw,
  expanded,
  onToggle,
}: {
  day: DayStudy;
  dwellFloorMw: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const detailsId = `badanie-readings-${day.date}`;
  const rowMuted = day.window.open ? 'text-text-secondary' : '';
  const rowBold = day.event ? 'font-semibold' : '';
  const rowClass = `${rowMuted} ${rowBold}`.trim();

  return (
    <>
      <tr className={rowClass}>
        <th scope="row" className="px-2 py-1.5 text-left font-normal">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className={`underline decoration-dotted ${rowBold}`}
          >
            {formatDayDate(day.date)}
          </button>
        </th>
        <td className="px-2 py-1.5 tnum">
          {day.window.open ? 'otwarte' : formatLocalTime(day.window.readAt)}
        </td>
        <td className="px-2 py-1.5 tnum">
          {/* The hour the study was scored on — the event's own when one is on
              record, else the hour that looked worst in its own window. It is
              NOT always 20:00: 01.09 scored on 21:00, 09.09 on 18:00. */}
          {day.worstHour === null ? '—' : `${String(day.worstHour).padStart(2, '0')}:00`}
        </td>
        <td className="px-2 py-1.5 text-right tnum">
          {day.surplus === null ? '—' : `${formatMW(day.surplus)} MW`}
        </td>
        <td className="px-2 py-1.5 text-right tnum">
          {day.margin === null ? '—' : signedMW(day.margin)}
        </td>
        <FeatureCell feature={day.headroom} format={signedMW} />
        <FeatureCell feature={day.dwell} format={formatMW} />
        <FeatureCell feature={day.eveMargin} format={signedMW} />
        <td
          className={`px-2 py-1.5 text-right tnum ${
            day.compass.extreme ? 'bg-alarm-soft text-alarm-text' : ''
          }`}
        >
          {day.compass.level === null ? '—' : day.compass.level}
        </td>
        <td className="px-2 py-1.5 text-right tnum">{day.extremeCount}/4</td>
        <td className="px-2 py-1.5">{VERDICT_WORD[day.verdict]}</td>
        <td className="px-2 py-1.5">{day.event ? formatEvent(day.event) : '—'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} id={detailsId} className="border-t border-separator px-2">
            {day.readings.length === 0 ? (
              <p className="py-2 text-[0.8125rem] text-text-secondary">Brak odczytów.</p>
            ) : (
              <ReadingsList day={day} dwellFloorMw={dwellFloorMw} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Column headers with a one-line explanation on hover — the owner's note:
 * "nie każdy wie", and "dwell" in particular is a word this page invented.
 * `title` is what a desktop reader hovers over; the paragraph above the
 * tables carries the same definitions for anyone on a phone, where hover does
 * not exist. Kept as data so a test can pin that every feature column has one.
 */
const COLUMNS: ReadonlyArray<{ label: string; hint?: string; align?: 'right' }> = [
  { label: 'Data' },
  {
    label: 'Okno',
    hint: 'Godzina ostatniego odczytu przed terminem wezwania (godzina docelowa minus 8 h). Wszystko w tym wierszu pochodzi z tego odczytu.',
  },
  {
    label: 'Godz. docelowa',
    hint: 'Godzina, dla której liczona jest ocena: ze zdarzenia w rejestrze, a bez niego ta, która w swoim oknie miała najniższą rezerwę (12–23).',
  },
  { label: 'Rezerwa', align: 'right', hint: 'Prognozowana rezerwa mocy na godzinę docelową w odczycie z okna.' },
  { label: 'Margines', align: 'right', hint: 'Rezerwa minus rezerwa wymagana. Poniżej zera przywołanie może zostać ogłoszone.' },
  {
    label: 'Zapas',
    align: 'right',
    hint: 'Ile rezerwy zostaje nad progiem 1100 MW, przy którym operator może odstąpić od ogłoszenia. Im mniej, tym gorzej.',
  },
  {
    label: 'Dwell',
    align: 'right',
    hint: 'Ile kolejnych odczytów wstecz od okna godzina docelowa siedziała poniżej 1500 MW. Mierzy trwałość niedoboru, nie jego chwilową głębokość: jedno mrugnięcie daje 1, doba trzymająca się nisko od wczoraj daje kilkadziesiąt.',
  },
  {
    label: 'D−1 wiecz.',
    align: 'right',
    hint: 'Margines godziny docelowej w ostatnim odczycie z dnia poprzedniego. Mówi, jak wcześnie problem był widoczny.',
  },
  {
    label: 'Kompas',
    align: 'right',
    hint: 'Stopień Kompasu Energetycznego PSE na godzinę docelową w wersji, która była aktywna w chwili okna. 2 i 3 to prośba operatora o ograniczenie poboru.',
  },
  {
    label: 'Ekstrema',
    align: 'right',
    hint: 'Ile z czterech cech (zapas, dwell, D−1, Kompas) jest w tej dobie skrajnych na tle pozostałych zamkniętych dób.',
  },
  {
    label: 'Werdykt',
    hint: 'Zestawienie liczby ekstremów z rejestrem: trafienie, fałszywy alarm, przeoczenie, cisza. „Otwarte" — termin jeszcze nie minął.',
  },
  { label: 'Zdarzenie', hint: 'Wpis z rejestru: test albo przywołanie, jedna jednostka albo cały rynek.' },
];

/**
 * One table, reused for each group below — the columns are the same whether
 * a day is still ahead or long settled; only which days are worth a reader's
 * eye differs.
 */
function DaysTable({
  caption,
  days,
  dwellFloorMw,
  expanded,
  onToggle,
}: {
  caption: string;
  days: DayStudy[];
  dwellFloorMw: number;
  expanded: ReadonlySet<string>;
  onToggle: (date: string) => void;
}) {
  // The hint line is our own, not the browser's `title` bubble: that one
  // waits about a second before it appears — long enough that the owner
  // reported "nic się nie pojawia" — and never appears at all on a phone.
  // Hover shows a hint at once; a click pins it, which is the only way a
  // touch screen can ask. Rendered above the table with a reserved height,
  // so a hint arriving does not push the rows down under the pointer.
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const shown = COLUMNS.find((column) => column.label === (hovered ?? pinned));

  return (
  <div className="mt-2">
      <p
        role="status"
        className="min-h-[2.5rem] text-[0.75rem] text-text-secondary"
      >
        {shown?.hint ? (
          <>
            <span className="font-semibold text-text">{shown.label}:</span> {shown.hint}
          </>
        ) : (
          'Najedź na nagłówek kolumny albo go kliknij, żeby zobaczyć, co mierzy.'
        )}
      </p>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.8125rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-separator text-left text-text-secondary">
            {COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`px-2 py-1.5 font-normal ${column.align === 'right' ? 'text-right' : ''}`}
              >
                {column.hint ? (
                  <button
                    type="button"
                    aria-pressed={pinned === column.label}
                    onMouseEnter={() => setHovered(column.label)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(column.label)}
                    onBlur={() => setHovered(null)}
                    onClick={() =>
                      setPinned((current) => (current === column.label ? null : column.label))
                    }
                    className="cursor-help underline decoration-dotted"
                  >
                    {column.label}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <DayRow
              key={day.date}
              day={day}
              dwellFloorMw={dwellFloorMw}
              expanded={expanded.has(day.date)}
              onToggle={() => onToggle(day.date)}
            />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/** Newest first — for settled days the latest is the one a reader compares against. */
function newestFirst(days: DayStudy[]): DayStudy[] {
  return [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function Content({ data }: { data: BadanieFile }) {
  const [expandedDates, setExpandedDates] = useState<ReadonlySet<string>>(new Set());

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const ahead = data.days.filter((day) => day.window.open);
  const settled = newestFirst(data.days.filter((day) => !day.window.open));
  // "Notable" is anything the verdict has something to say about: a hit, a
  // false alarm, a miss. Plain silence is the default state of the grid.
  const notable = settled.filter((day) => day.verdict !== 'cisza');
  const quiet = settled.filter((day) => day.verdict === 'cisza');

  return (
    <div className="bg-bg text-text p-4">
      <h1 className="text-[1.0625rem] font-semibold">Badanie przywołań</h1>
      <p className="mt-1 text-[0.8125rem] text-text-secondary">
        Strona robocza. Nic z tego nie trafia na ekran główny, dopóki reguła nie sprawdzi się
        na kolejnych zdarzeniach.
      </p>
      <p className="mt-1 text-[0.75rem] text-text-secondary">
        Wygenerowano: {formatLocalDateTime(data.generatedAt)}
      </p>

      <p className="mt-3 max-w-prose text-[0.8125rem] text-text-secondary">
        Okno decyzyjne to ostatni zarchiwizowany odczyt przed terminem — godzina docelowa minus{' '}
        {data.noticeHours} h. Cztery cechy wchodzą do oceny: zapas nad progem odstępstwa (
        {formatMW(data.exemptionMw)} MW), dwell (kolejne odczyty poniżej{' '}
        {formatMW(data.dwellFloorMw)} MW), margines wieczorem w dobie D−1 i poziom Kompasu na
        godzinie docelowej. Percentyl cechy to udział innych dób, które wypadły łagodniej niż ta;
        ekstremum zaczyna się od percentyla 0,9. Werdykt „alarm" liczy się od {data.alarmFrom}{' '}
        ekstremów na cztery.
      </p>

      {/* Ahead first: these are the rows that still change every hour and the
          only ones a forecast can act on. Settled days follow, and the quiet
          ones — most of them, on most weeks — sit behind a fold, because the
          owner's own reading of the page was "duzo przeszlych jest
          niepotrzebnie": a wall of "cisza" buries the one row that matters. */}
      <h2 className="mt-4 text-[0.875rem] font-semibold">Przed nami</h2>
      {ahead.length === 0 ? (
        <p className="mt-1 text-[0.8125rem] text-text-secondary">
          Brak dób z otwartym oknem — archiwum nie ma jeszcze odczytów na przyszłe doby.
        </p>
      ) : (
        <DaysTable
          caption="Doby, których termin decyzyjny jeszcze nie minął"
          days={ahead}
          dwellFloorMw={data.dwellFloorMw}
          expanded={expandedDates}
          onToggle={toggleDate}
        />
      )}

      <h2 className="mt-5 text-[0.875rem] font-semibold">Zamknięte — warte uwagi</h2>
      {notable.length === 0 ? (
        <p className="mt-1 text-[0.8125rem] text-text-secondary">
          Żadna zamknięta doba nie ma zdarzenia ani alarmu.
        </p>
      ) : (
        <DaysTable
          caption="Zamknięte doby ze zdarzeniem w rejestrze albo z alarmem"
          days={notable}
          dwellFloorMw={data.dwellFloorMw}
          expanded={expandedDates}
          onToggle={toggleDate}
        />
      )}

      {quiet.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[0.875rem] font-semibold">
            Cisza — {quiet.length} {quiet.length === 1 ? 'doba' : 'dób'} bez zdarzenia i bez alarmu
          </summary>
          <DaysTable
            caption="Zamknięte doby bez zdarzenia i bez alarmu"
            days={quiet}
            dwellFloorMw={data.dwellFloorMw}
            expanded={expandedDates}
            onToggle={toggleDate}
          />
        </details>
      )}

      <footer className="mt-4 text-[0.75rem] text-text-secondary">
        <h2 className="font-semibold text-text">Rejestr zdarzeń</h2>
        {data.events.length === 0 ? (
          <p className="mt-1">Brak zarejestrowanych zdarzeń.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {data.events.map((event) => (
              <li key={`${event.date}-${event.hour}`}>
                {formatDayDate(event.date)} {String(event.hour).padStart(2, '0')}:00 —{' '}
                {formatEvent(event)}
                {event.note ? `: ${event.note}` : ''}
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}

/**
 * Fetches the generator's output directly from GitHub's raw content, not from
 * this build's own `public/` — the whole point is to see the newest file
 * without redeploying the app, since a redeploy pass is exactly the ceremony
 * this "not on the main screen yet" page is meant to avoid.
 *
 * Mirrors useSummary's failure handling: every rejection resolves to the
 * error state rather than reaching the ErrorBoundary, because a network hiccup
 * on a research page is not "the app is broken".
 */
export default function Badanie() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(BADANIE_URL, { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<BadanieFile>) : null))
      .then((data) => {
        if (cancelled) return;
        setState(data ? { status: 'ready', data } : { status: 'error' });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="bg-bg p-4 text-text-secondary">Wczytywanie danych badania…</div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="bg-bg p-4 text-alarm-text">
        Brak danych badania — nie udało się pobrać pliku.
      </div>
    );
  }

  return <Content data={state.data} />;
}
