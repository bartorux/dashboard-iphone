import { useEffect, useState } from 'react';
import {
  BadanieFile,
  CallEvent,
  DayStudy,
  Feature,
  Observation,
  Outcome,
  Verdict,
} from '../utils/badanieTypes';
import { formatMW, signedMW } from '../utils/format';
import { issueUrlFor, ObservationDraft, parseObservationTitle } from '../utils/obserwacje';

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

/**
 * GitHub's REST API, read-only and unauthenticated — this page has no token
 * to send, same reasoning as `issueUrlFor` never taking one. Lists every
 * issue (open and closed) so a freshly filed report still shows up here in
 * the minutes before the hourly generator has had a chance to read it.
 */
export const ISSUES_URL =
  'https://api.github.com/repos/bartorux/dashboard-iphone/issues?state=all&per_page=100';

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

// Radio labels for the record form, in the owner's own words — distinct from
// `describeOutcome` below, which is the noun form used inline in sentences
// ("u nas nic" rather than "u nas nic było").
const OUTCOME_RADIO_LABEL: Record<Outcome, string> = {
  none: 'u nas nic było',
  test: 'test',
  real: 'przywołanie',
};

const SCOPE_RADIO_LABEL: Record<'unit' | 'market', string> = {
  unit: 'jedna lub kilka jednostek',
  market: 'cały rynek',
};

/**
 * Hours a call period can start on. Rozporządzenie §6: przywołania i testy
 * ogłasza się wyłącznie w blokach mieszczących się w 7:00-22:00, więc godziny
 * startowe są 7-21 — the same range `badanie.ts` auto-selects a target hour
 * from (AUTO_HOUR_FIRST/AUTO_HOUR_LAST there).
 */
const OBSERVATION_HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
const OBSERVATION_HOUR_FIRST = 7;
const OBSERVATION_HOUR_LAST = 21;
/** Used when the day's own target hour falls outside 7-21 (should not
 *  happen now that the study's own range matches, but a defensive fallback
 *  costs nothing and keeps the form usable against an older data file). */
const DEFAULT_HOUR_FALLBACK = 19;

/** The hour "Zapisz, co było" pre-selects for a given day: its own target
 *  hour when that falls in the allowed 7-21 range, else the fallback.
 *  Exported so a test can pin the fallback branch without going through the
 *  DOM — every day in the file's own study fixture lands in-range, so the
 *  fallback needs a hand-built `DayStudy` to exercise at all. */
export function defaultHourFor(day: DayStudy | null): number {
  const worstHour = day?.worstHour ?? null;
  if (worstHour !== null && worstHour >= OBSERVATION_HOUR_FIRST && worstHour <= OBSERVATION_HOUR_LAST) {
    return worstHour;
  }
  return DEFAULT_HOUR_FALLBACK;
}

/** The outcome half of an observation's text, shared by every place that
 *  renders one (table cell, footer line, pending list, day-select option) so
 *  the wording never drifts between them. Reuses EVENT_*_WORD: an
 *  Observation's `test`/`real` + `scope` is the same vocabulary as a
 *  CallEvent's `kind` + `scope`. */
function describeOutcome(outcome: Outcome, scope?: 'unit' | 'market'): string {
  if (outcome === 'none') return 'u nas nic';
  return `${EVENT_KIND_WORD[outcome]}, ${EVENT_SCOPE_WORD[scope ?? 'unit']}`;
}

/** One line for the footer register: date (+ hour, for anything but "none"),
 *  the outcome, where it came from when that is an issue rather than the
 *  hand-kept register, and the free note. */
function formatObservationLine(obs: Observation): string {
  const date = formatDayDate(obs.date);
  const github = obs.source === 'issue' ? ` (z GitHub #${obs.issueNumber})` : '';
  const note = obs.note ? `: ${obs.note}` : '';
  const desc = describeOutcome(obs.outcome, obs.scope);
  if (obs.outcome === 'none') return `${date} — ${desc}${github}${note}`;
  const hour = `${String(obs.hour ?? 0).padStart(2, '0')}:00`;
  return `${date} ${hour} — ${desc}${github}${note}`;
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
 * Dwell, in hours — always one decimal place, Polish comma (`toLocaleString`
 * with `pl-PL`, same convention `formatPercentile` above uses). Unlike
 * `formatMW`/`signedMW`, which format a whole megawatt figure, `dwell` is a
 * fractional hour count now that it measures a time span rather than a
 * reading count — see `badanie.ts`'s `dwellFor`.
 */
function formatDwellHours(hours: number): string {
  return `${hours.toLocaleString('pl-PL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
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
 *
 * Each reading also carries planned exchange (negative = export, same sign
 * convention as `PSEDataPoint.exchange`) — the hypothesis this study exists
 * to check is that the forecast steadies once exchange is added, and often
 * late, so a reading whose exchange differs from the one right before it is
 * flagged "(zmiana salda)": that is the moment worth noticing, not the
 * figure itself.
 */
function ReadingsList({ day, dwellFloorMw }: { day: DayStudy; dwellFloorMw: number }) {
  return (
    <ol className="space-y-1 py-2 pl-1 text-[0.8125rem]">
      {day.readings.map(([readAt, surplus, required, exchange], index) => {
        const isWindow = readAt === day.window.readAt;
        const margin = surplus - required;
        const belowFloor = surplus < dwellFloorMw;
        const currentExchange = exchange ?? null;
        const previousExchange = index > 0 ? (day.readings[index - 1][3] ?? null) : null;
        const exchangeChanged = index > 0 && currentExchange !== previousExchange;
        return (
          <li
            key={readAt}
            className={`tnum ${isWindow ? 'font-semibold' : ''} ${
              belowFloor ? 'text-warn-text' : ''
            }`}
          >
            {formatLocalDateTime(readAt)} — rezerwa {formatMW(surplus)} MW, wymagana{' '}
            {formatMW(required)} MW, margines {signedMW(margin)}, wymiana{' '}
            {currentExchange === null ? '—' : signedMW(currentExchange)}
            {exchangeChanged && <strong> (zmiana salda)</strong>}
            {isWindow && ' (okno)'}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What the "Zdarzenie" column shows, in priority order: "nothing" first — an
 * issue-sourced `none` is worth saying even when the register itself is
 * silent, and it is the one outcome the register cannot express at all —
 * then a test/real observation filed through Issues (tagged, so a reader
 * knows it did not come from the hand-kept register), and only then the
 * register's own event. A register-sourced observation is never printed on
 * top of the event it was derived from — same fact, shown once.
 */
function eventCellContent(day: DayStudy): { text: string; muted: boolean } {
  const obs = day.observation;
  if (obs?.outcome === 'none') return { text: 'u nas nic', muted: true };
  if (obs && obs.source === 'issue') {
    return { text: `${describeOutcome(obs.outcome, obs.scope)} (z GitHub)`, muted: false };
  }
  if (day.event) return { text: formatEvent(day.event), muted: false };
  return { text: '—', muted: false };
}

/**
 * "Inne godziny z ujemnym marginesem w oknie: 18:00 (−300 MW), 21:00 (−120
 * MW)" — or "brak" when nothing else was tight. Shown above the readings
 * list so a single target hour never hides that the same day had more than
 * one hour looking bad; see `DayStudy.tightHours` in badanie.ts.
 */
function formatTightHoursLine(day: DayStudy): string {
  if (day.tightHours.length === 0) {
    return 'Inne godziny z ujemnym marginesem w oknie: brak.';
  }
  const parts = day.tightHours.map(
    (h) => `${String(h.hour).padStart(2, '0')}:00 (${signedMW(h.margin)})`
  );
  return `Inne godziny z ujemnym marginesem w oknie: ${parts.join(', ')}.`;
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
  const eventCell = eventCellContent(day);

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
        <FeatureCell feature={day.dwell} format={formatDwellHours} />
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
        <td className={`px-2 py-1.5 ${eventCell.muted ? 'text-text-secondary' : ''}`}>
          {eventCell.text}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} id={detailsId} className="border-t border-separator px-2">
            <p className="pt-2 text-[0.8125rem] text-text-secondary">{formatTightHoursLine(day)}</p>
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
    label: 'Dwell (h)',
    align: 'right',
    hint: 'Ile godzin godzina docelowa siedziała poniżej 1500 MW bez przerwy, licząc wstecz od okna. Mierzy trwałość niedoboru, nie jego chwilową głębokość: jedno mrugnięcie tuż przy oknie daje 0 h, doba trzymająca się nisko od wczoraj daje kilkanaście czy kilkadziesiąt godzin.',
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
  {
    label: 'Zdarzenie',
    hint: 'Wpis z rejestru: test albo przywołanie, jedna jednostka albo cały rynek — albo obserwacja zgłoszona w GitHub Issues, w tym „u nas nic".',
  },
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

/** Newest closed day without a recorded observation, or else the newest
 *  closed day overall — closed because until the window shuts there is
 *  nothing yet to record, and "newest" gives the owner the freshest gap to
 *  fill without hunting through the dropdown. Exported standalone so a test
 *  can pin the selection rule without going through the DOM. */
export function defaultDraftFor(days: DayStudy[]): string | null {
  const closed = newestFirst(days.filter((day) => !day.window.open));
  const withoutEntry = closed.find((day) => day.observation === null);
  return (withoutEntry ?? closed[0])?.date ?? null;
}

/**
 * "Zapisz, co było": the owner's own way of writing to this page without a
 * backend or a token. It never posts anything itself — filling the form only
 * builds the pre-filled GitHub "new issue" link via `issueUrlFor`; pressing
 * "Submit" on GitHub is the actual write, and the hourly generator reads it
 * back into badanie.json. Only closed days are offered: an open one has
 * nothing yet to confirm or deny.
 */
function ObservationRecorder({ days }: { days: DayStudy[] }) {
  const closedDays = newestFirst(days.filter((day) => !day.window.open));
  const [date, setDate] = useState<string | null>(() => defaultDraftFor(days));
  const selectedDay = closedDays.find((day) => day.date === date) ?? closedDays[0] ?? null;
  const [outcome, setOutcome] = useState<Outcome>('none');
  const [hour, setHour] = useState<number>(() => defaultHourFor(selectedDay));
  const [scope, setScope] = useState<'unit' | 'market'>('unit');
  const [note, setNote] = useState('');

  if (!selectedDay) return null;

  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    // The target hour follows the newly chosen day rather than staying
    // pinned to whichever day was picked before.
    const day = closedDays.find((d) => d.date === nextDate) ?? null;
    setHour(defaultHourFor(day));
  };

  const draft: ObservationDraft =
    outcome === 'none'
      ? { date: selectedDay.date, outcome: 'none' }
      : { date: selectedDay.date, outcome, hour, scope };
  const href = issueUrlFor('bartorux/dashboard-iphone', draft, note);

  return (
    <section className="mt-4">
      <h2 className="text-[0.875rem] font-semibold">Zapisz, co było</h2>
      <div className="mt-2 flex flex-col gap-3 text-[0.8125rem]">
        <div>
          <label htmlFor="obs-date" className="block text-text-secondary">
            Doba
          </label>
          <select
            id="obs-date"
            value={selectedDay.date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="mt-1 rounded-lg border border-separator bg-surface px-2 py-1.5"
          >
            {closedDays.map((day) => (
              <option key={day.date} value={day.date}>
                {formatDayDate(day.date)}
                {day.observation === null
                  ? ' — bez wpisu'
                  : ` — zapisane: ${
                      day.observation.outcome === 'none'
                        ? describeOutcome('none')
                        : `${String(day.observation.hour ?? 0).padStart(2, '0')}:00 ${describeOutcome(
                            day.observation.outcome,
                            day.observation.scope
                          )}`
                    }`}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="text-text-secondary">Wynik</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {(Object.keys(OUTCOME_RADIO_LABEL) as Outcome[]).map((value) => (
              <label key={value} className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="obs-outcome"
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                />
                {OUTCOME_RADIO_LABEL[value]}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Always visible, not just for test/real: the owner's own complaint
            was that the hour picker only appeared once "test" or
            "przywołanie" was already selected, so it went unnoticed.
            Disabled — not hidden — for "u nas nic", which carries no hour. */}
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="obs-hour" className="block text-text-secondary">
              Godzina
            </label>
            <select
              id="obs-hour"
              value={hour}
              disabled={outcome === 'none'}
              onChange={(e) => setHour(Number(e.target.value))}
              className="mt-1 rounded-lg border border-separator bg-surface px-2 py-1.5 disabled:opacity-50"
            >
              {OBSERVATION_HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <fieldset disabled={outcome === 'none'}>
            <legend className="text-text-secondary">Zakres</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {(Object.keys(SCOPE_RADIO_LABEL) as Array<'unit' | 'market'>).map((value) => (
                <label
                  key={value}
                  className={`inline-flex items-center gap-1 ${outcome === 'none' ? 'opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="obs-scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                  />
                  {SCOPE_RADIO_LABEL[value]}
                </label>
              ))}
            </div>
          </fieldset>
          {outcome === 'none' && (
            <p className="w-full text-[0.75rem] text-text-secondary">
              (dla testu lub przywołania)
            </p>
          )}
        </div>

        <div>
          <label htmlFor="obs-note" className="block text-text-secondary">
            Notatka (opcjonalnie)
          </label>
          <textarea
            id="obs-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="np. wezwanie o 11:14"
            rows={2}
            className="mt-1 w-full rounded-lg border border-separator bg-surface px-2 py-1.5"
          />
        </div>

        <div>
          <a
            href={href}
            target="_blank"
            rel="noopener"
            className="inline-block rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent"
          >
            Zapisz w GitHub
          </a>
          <p className="mt-1 text-[0.75rem] text-text-secondary">
            Otworzy się gotowe zgłoszenie w GitHub — wystarczy nacisnąć „Submit”. Generator wczyta
            je w ciągu godziny.
          </p>
        </div>
      </div>
    </section>
  );
}

/** One parsed-but-not-yet-generated observation: the page already knows the
 *  shape (obserwacje.ts parses it the same way the generator will), but
 *  badanie.json has not been rebuilt with it yet. */
interface PendingObservation extends ObservationDraft {
  issueNumber: number;
  url: string;
}

function formatPendingLine(item: PendingObservation): string {
  const date = formatDayDate(item.date);
  const desc = describeOutcome(item.outcome, item.scope);
  if (item.outcome === 'none') return `${date} — ${desc} (#${item.issueNumber})`;
  const hour = `${String(item.hour ?? 0).padStart(2, '0')}:00`;
  return `${date} ${hour} — ${desc} (#${item.issueNumber})`;
}

/**
 * Issues filed through the form above but not yet folded into badanie.json —
 * the generator only runs hourly, so there is always a window where the
 * owner has pressed "Submit" and the page still has nothing to show for it.
 * Matched against `observations` sourced from an issue specifically: a
 * register-typed observation on the same date does not mean THIS issue was
 * read yet. A failed fetch is not this page's problem — the list is simply
 * absent, same reasoning as Badanie's own load — a network hiccup on a
 * research page is not "the app is broken".
 */
function PendingIssues({ observations }: { observations: Observation[] }) {
  const [pending, setPending] = useState<PendingObservation[]>([]);

  useEffect(() => {
    let cancelled = false;
    const known = new Set(
      observations.filter((obs) => obs.source === 'issue').map((obs) => obs.date)
    );

    fetch(ISSUES_URL, { cache: 'no-store' })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error('bad status'))
      )
      .then((issues: Array<{ number: number; title: string; html_url: string }>) => {
        if (cancelled) return;
        const items: PendingObservation[] = [];
        for (const issue of issues) {
          const draft = parseObservationTitle(issue.title);
          if (!draft || known.has(draft.date)) continue;
          items.push({ ...draft, issueNumber: issue.number, url: issue.html_url });
        }
        setPending(items);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });

    return () => {
      cancelled = true;
    };
  }, [observations]);

  if (pending.length === 0) return null;

  return (
    <section className="mt-4">
      <h2 className="text-[0.875rem] font-semibold">Zgłoszone, czeka na przeliczenie</h2>
      <ul className="mt-1 space-y-0.5 text-[0.8125rem]">
        {pending.map((item) => (
          <li key={item.issueNumber}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener"
              className="text-accent-text underline"
            >
              {formatPendingLine(item)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
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
        {formatMW(data.exemptionMw)} MW), dwell (ile godzin godzina docelowa siedziała poniżej{' '}
        {formatMW(data.dwellFloorMw)} MW bez przerwy), margines wieczorem w dobie D−1 i poziom Kompasu na
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

      <ObservationRecorder days={data.days} />
      <PendingIssues observations={data.observations} />

      <footer className="mt-4 text-[0.75rem] text-text-secondary">
        <h2 className="font-semibold text-text">Rejestr zdarzeń i obserwacji</h2>
        {data.observations.length === 0 ? (
          <p className="mt-1">Brak zarejestrowanych obserwacji.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {data.observations.map((obs) => (
              <li key={obs.date}>{formatObservationLine(obs)}</li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}

/**
 * The file on the server can be one generator version behind this page: the
 * observations fields were added on 06.09.2026 and, for the hour between a
 * deploy and the next scheduled run, the live file simply lacks them. A
 * missing list is an empty list, never a crash — this page must open on the
 * older file exactly as it did before the fields existed.
 */
export function withObservations(data: BadanieFile): BadanieFile {
  return {
    ...data,
    observations: Array.isArray(data.observations) ? data.observations : [],
    days: (data.days ?? []).map((day) => ({ ...day, observation: day.observation ?? null })),
  };
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
        setState(data ? { status: 'ready', data: withObservations(data) } : { status: 'error' });
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
