import React from 'react';
import { AlertRange } from '../types';
import { dayLabel } from '../utils/dayWindow';
import { formatMW, signedMW } from '../utils/format';
import { AlertIcon, CheckIcon } from './icons';
import Skeleton from './Skeleton';

interface AlertsPanelProps {
  ranges: AlertRange[];
  currentDayOffset: number;
  /** False when the day has no readings at all — distinct from "no alerts". */
  hasData: boolean;
  /**
   * First fetch of the session — the flag behind the header's 'loading'. Not
   * "a request is in flight": on a refresh the ranges below are still correct.
   */
  isLoading?: boolean;
}

const SEVERITY_STYLE = {
  red: {
    wrapper: 'bg-alarm-soft',
    bar: 'bg-alarm',
    text: 'text-alarm-text',
    label: 'Alarm',
  },
  orange: {
    wrapper: 'bg-warn-soft',
    bar: 'bg-warn',
    text: 'text-warn-text',
    label: 'Uwaga',
  },
} as const;

/* ---------------------------------------------------------------------------
   PROTOTYP — cztery formy tego samego bloku, przełączane bez rekompilacji.

   `document.documentElement` niesie `data-alerty="w1|w2|w3|w4"`. Bez atrybutu
   (czyli w produkcji i w testach jednostkowych) renderuje się w1, znak w znak
   dzisiejszy stan — dzięki temu wariant odniesienia nie jest rekonstrukcją,
   tylko oryginałem, a bramki mierzą to samo co przed prototypem.

     w1  lista jak dziś (odniesienie)
     w2  oś doby + najostrzejsze okno + skrócone pozostałe
     w3  tabela: kolumny, liczby do prawej, zero prozy
     w4  ta sama lista, dociśnięta typograficznie
   --------------------------------------------------------------------------- */

type Variant = 'w1' | 'w2' | 'w3' | 'w4';

const VARIANTS: readonly string[] = ['w1', 'w2', 'w3', 'w4'];

const readVariant = (): Variant => {
  if (typeof document === 'undefined') return 'w1';
  const value = document.documentElement.getAttribute('data-alerty');
  return value && VARIANTS.includes(value) ? (value as Variant) : 'w1';
};

/**
 * Odczyt atrybutu z `<html>` plus obserwator na nim. Obserwator jest tu nie
 * dla wygody, tylko dlatego, że `page.addInitScript` biegnie zanim React
 * zamontuje cokolwiek, a bywa też, że zanim istnieje element, na którym ma
 * ustawić atrybut — wtedy atrybut pojawia się po pierwszym renderze i bez
 * obserwatora prototyp pokazałby w1 niezależnie od tego, o co poproszono.
 */
function useVariant(): Variant {
  const [variant, setVariant] = React.useState<Variant>(readVariant);

  React.useEffect(() => {
    const sync = () => setVariant(readVariant());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-alerty'],
    });
    return () => observer.disconnect();
  }, []);

  return variant;
}

/** "09:00" -> 9. Znacznik "03a" z jesiennej zmiany czasu też daje 3. */
const startHour = (label: string) => parseInt(label, 10) || 0;

/** Najgłębszy margines w dobie — czerwień bije pomarańcz przez samą liczbę. */
const sharpest = (ranges: AlertRange[]) =>
  ranges.reduce((worst, range) =>
    range.worstDifference < worst.worstDifference ? range : worst
  );

/* ---------------------------------------------------------------------------
   w2 — oś doby

   Pasek 24 godzin z oknami alertowymi na swoich miejscach. Odpowiada na
   pytanie, którego lista nie stawia wcale: KIEDY w dobie jest ciasno — czy to
   szczyt wieczorny, czy poranna dolina.

   Ciężkość niesie tu drugi kanał obok barwy: alarm wypełnia pasek na całą
   wysokość, uwaga siedzi w nim niżej. Sama oś jest aria-hidden — status z
   ikoną i etykietą stoi w wierszach pod nią, oś go tylko umiejscawia.
   --------------------------------------------------------------------------- */
const DayAxis: React.FC<{ ranges: AlertRange[] }> = ({ ranges }) => (
  <div aria-hidden className="mb-3">
    <div className="relative h-3.5 overflow-hidden rounded-full bg-surface-2">
      {ranges.map((range) => {
        const style = SEVERITY_STYLE[range.severity];
        const from = startHour(range.from);
        const span = Math.min(range.hours, 24 - from);
        return (
          <span
            key={`${range.severity}-${range.from}`}
            className={`absolute rounded-full ${style.bar} ${
              // Uwaga siedzi w pasku niżej niż alarm: kanał wielkości idzie w
              // tę samą stronę co ciężkość, więc nie przeczy barwie.
              range.severity === 'red' ? 'top-0 bottom-0' : 'top-[3px] bottom-[3px]'
            }`}
            style={{
              // 1 px luzu z każdej strony: dwa stykające się okna rozdziela
              // szczelina w kolorze toru, a nie obwódka dorysowana wokół nich.
              left: `calc(${(from / 24) * 100}% + 1px)`,
              width: `calc(${(span / 24) * 100}% - 2px)`,
            }}
          />
        );
      })}
    </div>
    <div className="relative mt-1 h-3.5">
      {[0, 6, 12, 18, 24].map((hour) => (
        <span
          key={hour}
          className="absolute top-0 flex flex-col items-center"
          style={{
            left: `${(hour / 24) * 100}%`,
            transform:
              hour === 0
                ? 'none'
                : hour === 24
                  ? 'translateX(-100%)'
                  : 'translateX(-50%)',
          }}
        >
          <span className="h-[3px] w-px bg-separator" />
          <span className="tnum mt-px text-[0.625rem] leading-none text-text-tertiary">
            {String(hour).padStart(2, '0')}
          </span>
        </span>
      ))}
    </div>
  </div>
);

const VariantTwo: React.FC<{ ranges: AlertRange[] }> = ({ ranges }) => {
  const worst = sharpest(ranges);
  const style = SEVERITY_STYLE[worst.severity];
  const rest = ranges.filter((range) => range !== worst);

  return (
    <div>
      <DayAxis ranges={ranges} />

      <div className={`flex gap-3 overflow-hidden rounded-xl ${style.wrapper}`}>
        <span className={`w-1 shrink-0 ${style.bar}`} aria-hidden />
        <div className="min-w-0 flex-1 py-2.5 pr-3">
          <div className="flex items-baseline justify-between gap-2">
            {/* "Najostrzejsze" zakłada porównanie. Przy jednym oknie nie ma z
                czym porównywać i nadpis kłamałby o zawartości karty. */}
            <span className="text-[0.6875rem] font-medium text-text-tertiary">
              {ranges.length > 1 ? 'Najostrzejsze okno' : 'Okno alertowe'}
            </span>
            <span
              className={`flex items-center gap-1 text-[0.6875rem] font-semibold ${style.text}`}
            >
              <AlertIcon className="h-3.5 w-3.5" />
              {style.label}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3">
            <span className="tnum text-[1.0625rem] font-semibold text-text">
              {worst.from}–{worst.to}
            </span>
            <span className={`tnum text-[1.0625rem] font-semibold ${style.text}`}>
              {signedMW(worst.worstDifference)}
            </span>
          </div>
          <p className="tnum mt-0.5 text-[0.75rem] text-text-secondary">
            najniżej o {worst.worstHour} · rezerwa {formatMW(worst.reserve)} /
            wymagana {formatMW(worst.required)} MW
          </p>
        </div>
      </div>

      {rest.length > 0 && (
        <ul className="mt-2 xl:grid xl:grid-cols-2 xl:gap-x-6">
          {rest.map((range) => {
            const rowStyle = SEVERITY_STYLE[range.severity];
            return (
              <li
                key={`${range.severity}-${range.from}`}
                className="flex items-baseline gap-2 border-t border-separator py-1.5"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${rowStyle.bar}`} aria-hidden />
                <span className="tnum text-[0.8125rem] font-medium text-text">
                  {range.from}–{range.to}
                </span>
                <span
                  className={`flex shrink-0 items-center gap-0.5 text-[0.6875rem] font-semibold ${rowStyle.text}`}
                >
                  <AlertIcon className="h-3 w-3" />
                  {rowStyle.label}
                </span>
                <span
                  className={`tnum ml-auto text-[0.8125rem] font-semibold ${rowStyle.text}`}
                >
                  {signedMW(range.worstDifference)}
                </span>
                {/* Para rezerwa/wymagana wraca tam, gdzie jest na nią miejsce.
                    Na telefonie to jedyna liczba, którą ten wariant oddaje za
                    obraz doby — na monitorze nie oddaje nic. */}
                <span className="tnum hidden w-[8.5rem] shrink-0 text-right text-[0.75rem] text-text-secondary xl:inline">
                  {formatMW(range.reserve)} / {formatMW(range.required)} MW
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   w3 — tabela

   Nagłówki kolumn mówią raz to, co dziś powtarza się w każdym wierszu
   ("Najniższy margines" siedem razy pod rząd). Liczby stoją w kolumnie, do
   prawej, tnum — porównanie dwóch okien to ruch oka w dół, nie czytanie zdań.

   Na telefonie te same kolumny w dwóch rzędach; na monitorze jeden rząd na
   okno i pełna szerokość zamiast dwóch węższych kart obok siebie.
   --------------------------------------------------------------------------- */
const TABLE_GRID =
  'grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 ' +
  'xl:grid-cols-[7.5rem_7.5rem_1fr_7rem_12rem]';

const VariantThree: React.FC<{ ranges: AlertRange[] }> = ({ ranges }) => (
  <div>
    <div
      aria-hidden
      className={`${TABLE_GRID} pb-1.5 text-[0.6875rem] font-medium text-text-tertiary`}
    >
      <span className="col-start-1 row-start-1">Godziny</span>
      <span className="col-start-2 row-start-1">Ciężkość</span>
      <span className="col-start-3 row-start-1 text-right xl:col-start-4">
        Margines
      </span>
      {/* Na telefonie wiersz łamie się na dwa rzędy, więc nagłówek też — inaczej
          druga linia wiersza ("09:00", "2457 / 2011 MW") nie ma jak się nazwać. */}
      <span className="col-start-2 row-start-2 xl:col-start-3 xl:row-start-1">
        Najniżej o
      </span>
      <span className="col-start-3 row-start-2 text-right xl:col-start-5 xl:row-start-1">
        Rezerwa / wymagana
      </span>
    </div>

    <ul>
      {ranges.map((range) => {
        const style = SEVERITY_STYLE[range.severity];
        return (
          <li
            key={`${range.severity}-${range.from}`}
            className={`${TABLE_GRID} border-t border-separator py-2`}
          >
            <span className="tnum col-start-1 row-start-1 text-[0.875rem] font-semibold text-text">
              {range.from}–{range.to}
            </span>
            <span
              className={`col-start-2 row-start-1 flex items-center gap-1 text-[0.75rem] font-semibold ${style.text}`}
            >
              <AlertIcon className="h-3.5 w-3.5 shrink-0" />
              {style.label}
            </span>
            <span
              className={`tnum col-start-3 row-start-1 text-right text-[0.875rem] font-semibold xl:col-start-4 ${style.text}`}
            >
              {signedMW(range.worstDifference)}
            </span>
            {/* Bez "o": przyimek stoi już w nagłówku kolumny, a powtórzony w
                każdym wierszu rozjeżdża lewą krawędź godzin. */}
            <span className="tnum col-start-2 row-start-2 text-[0.75rem] text-text-tertiary xl:col-start-3 xl:row-start-1">
              {range.worstHour}
            </span>
            <span className="tnum col-start-3 row-start-2 text-right text-[0.75rem] text-text-secondary xl:col-start-5 xl:row-start-1">
              {formatMW(range.reserve)} / {formatMW(range.required)} MW
            </span>
          </li>
        );
      })}
    </ul>
  </div>
);

/* ---------------------------------------------------------------------------
   w4 — lista dociśnięta

   Ta sama forma co dziś, przestawiona hierarchia. Dwie liczby, na których
   zapada decyzja — kiedy i jak głęboko — stoją obok siebie w jednej linii i w
   jednym stopniu pisma, jedna przy lewej krawędzi, druga przy prawej, więc
   układają się w kolumny przez wszystkie wiersze. Reszta schodzi do linii
   drugiej. "Najniższy margines" znika z siedmiu wierszy i pada raz, w podpisie
   pod listą.
   --------------------------------------------------------------------------- */
const VariantFour: React.FC<{ ranges: AlertRange[] }> = ({ ranges }) => (
  <div>
    <ul className="space-y-1.5 xl:grid xl:grid-cols-2 xl:gap-1.5 xl:space-y-0">
      {ranges.map((range) => {
        const style = SEVERITY_STYLE[range.severity];
        return (
          <li
            key={`${range.severity}-${range.from}`}
            className={`flex gap-3 overflow-hidden rounded-xl ${style.wrapper}`}
          >
            <span className={`w-1 shrink-0 ${style.bar}`} aria-hidden />
            <div className="min-w-0 flex-1 py-2 pr-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="tnum text-[0.9375rem] font-semibold text-text">
                  {range.from}–{range.to}
                </span>
                <span className={`tnum text-[0.9375rem] font-semibold ${style.text}`}>
                  {signedMW(range.worstDifference)}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <span
                  className={`flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold ${style.text}`}
                >
                  <AlertIcon className="h-3.5 w-3.5" />
                  {style.label}
                </span>
                <span className="tnum text-[0.75rem] text-text-secondary">
                  o {range.worstHour} · {formatMW(range.reserve)} /{' '}
                  {formatMW(range.required)} MW
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
    {/* Raz, zamiast siedmiu razy "Najniższy margines" w kolejnych wierszach. */}
    <p className="mt-2 text-[0.6875rem] text-text-tertiary">
      Po prawej: najniższy margines oraz rezerwa / wymagana moc.
    </p>
  </div>
);

/** Dzisiejsza lista, bez zmian — wariant odniesienia. */
const VariantOne: React.FC<{ ranges: AlertRange[] }> = ({ ranges }) => (
  <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0">
    {ranges.map((range) => {
      const style = SEVERITY_STYLE[range.severity];
      return (
        <li
          key={`${range.severity}-${range.from}`}
          className={`flex gap-3 overflow-hidden rounded-xl ${style.wrapper}`}
        >
          <span className={`w-1 shrink-0 ${style.bar}`} aria-hidden />
          <div className="min-w-0 flex-1 py-2.5 pr-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="tnum text-[0.9375rem] font-semibold text-text">
                {range.from}–{range.to}
              </span>
              <span
                className={`flex items-center gap-1 text-[0.6875rem] font-semibold ${style.text}`}
              >
                <AlertIcon className="h-3.5 w-3.5" />
                {style.label}
              </span>
            </div>
            <p className="tnum mt-0.5 text-[0.75rem] text-text-secondary">
              Najniższy margines{' '}
              <span className={`font-semibold ${style.text}`}>
                {signedMW(range.worstDifference)}
              </span>{' '}
              o {range.worstHour} · rezerwa {formatMW(range.reserve)} / wymagana{' '}
              {formatMW(range.required)} MW
            </p>
          </div>
        </li>
      );
    })}
  </ul>
);

/** Szkielet w kształcie tego, co za chwilę stanie na jego miejscu. */
const LoadingSkeleton: React.FC<{ variant: Variant }> = ({ variant }) => {
  if (variant === 'w2') {
    return (
      // Oś i blok najostrzejszego okna. Bez zastępnika pod osią: godziny na
      // niej to rzadkie, drobne napisy, a pasek na całą szerokość obiecywałby
      // drugi tor, którego za chwilę nie będzie.
      <div>
        <Skeleton className="h-3.5 w-full rounded-full" />
        <Skeleton className="mt-4 h-[4.5rem] w-full rounded-xl" />
      </div>
    );
  }
  if (variant === 'w3') {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (variant === 'w4') {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-[3.25rem] w-full rounded-xl" />
        <Skeleton className="h-[3.25rem] w-full rounded-xl" />
      </div>
    );
  }
  return <Skeleton className="h-16 w-full rounded-xl" />;
};

/**
 * Consecutive alert hours arrive pre-merged into ranges: a four-hour risk window
 * reads as one "17:00-21:00" entry instead of four near-identical rows.
 */
const AlertsPanel: React.FC<AlertsPanelProps> = ({
  ranges,
  currentDayOffset,
  hasData,
  isLoading = false,
}) => {
  const dayName = dayLabel(currentDayOffset);
  const hours = ranges.reduce((sum, range) => sum + range.hours, 0);
  const variant = useVariant();

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[0.9375rem] font-semibold text-text">
          Alerty <span className="text-text-tertiary">· {dayName}</span>
        </h2>
        {hours > 0 && (
          <span className="tnum rounded-full bg-alarm px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
            {hours} godz.
          </span>
        )}
      </div>

      {/*
        This branch has to come FIRST, before !hasData.

        With nothing fetched yet, hasData is false — and the panel therefore
        announced "Brak danych dla tego dnia" for the whole of the first
        fetch. That is not a slow answer, it is a false one: the day's
        forecast exists, we simply had not asked for it yet, and the reader
        was told PSE had published nothing. Once the request has landed,
        `hasData` regains its real meaning and the sentence below is true
        again.
      */}
      {isLoading && !hasData ? (
        <LoadingSkeleton variant={variant} />
      ) : !hasData ? (
        // Without readings we cannot claim an all-clear — a green "no alerts"
        // here would present missing data as a confirmed safe state.
        <div className="rounded-xl bg-surface-2 px-3 py-3 text-[0.8125rem] text-text-tertiary">
          Brak danych dla tego dnia
        </div>
      ) : ranges.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-3 text-[0.8125rem] text-ok-text">
          <CheckIcon className="h-4 w-4 shrink-0" />
          Brak alertów w tym dniu
        </div>
      ) : variant === 'w2' ? (
        <VariantTwo ranges={ranges} />
      ) : variant === 'w3' ? (
        <VariantThree ranges={ranges} />
      ) : variant === 'w4' ? (
        <VariantFour ranges={ranges} />
      ) : (
        <VariantOne ranges={ranges} />
      )}
    </section>
  );
};

export default AlertsPanel;
