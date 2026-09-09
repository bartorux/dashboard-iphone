import React from 'react';
import { AlertRange, SystemStatus } from '../types';
import { CompassRange } from '../utils/compass';
import { dayLabel } from '../utils/dayWindow';
import { formatMW, signedMW } from '../utils/format';
import { marginLabel } from '../utils/status';
import { ALERTS_CARD_PADDING_PX, dayAxisInset } from './chart/shared';
import CompassRows from './CompassRows';
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
  /**
   * Kompas Energetyczny PSE ranges for the day on screen, independent of
   * `ranges` above: the margin can be calm while the operator still asks for
   * saving, and that combination — not "alerts and compass together" — is the
   * case this feature exists for. An empty array here must render nothing
   * (see CompassRows), never a "no signal" row: with the endpoint holding two
   * business days against a five-day window, that would read as a daily
   * non-event on most tabs.
   */
  compassRanges?: CompassRange[];
  /**
   * True when PSE has not yet cleared the day-ahead cross-border exchange
   * plan for the day on screen — see `exchangePlanned` in exchangePlan.ts.
   * Until it clears, the reserve above is computed WITHOUT the import that
   * usually covers most of the evening gap, so a narrow or negative margin on
   * such a day is not the settled picture yet. This never changes a status or
   * a threshold (see App.tsx) — it only adds the one sentence below, in the
   * same place the Kompas block earns its own: never in the header, never in
   * the status card.
   */
  exchangeMissing?: boolean;
}

const SEVERITY_STYLE = {
  red: {
    wrapper: 'bg-alarm-soft',
    bar: 'bg-alarm',
    text: 'text-alarm-text',
    pill: 'bg-alarm-soft text-alarm-text',
  },
  orange: {
    wrapper: 'bg-warn-soft',
    bar: 'bg-warn',
    text: 'text-warn-text',
    pill: 'bg-warn-soft text-warn-text',
  },
} as const;

/**
 * `findAlerts` classifies by `'red' | 'orange'`, but the row label wording
 * (see `marginLabel` in status.ts) is shared with ReserveTooltip, which
 * speaks in `SystemStatus`. One place to convert rather than two copies of
 * "red means alarm".
 */
const SEVERITY_TO_STATUS: Record<AlertRange['severity'], SystemStatus> = {
  red: 'alarm',
  orange: 'warn',
};

/** "17:00" -> 17. */
const startHour = (label: string) => parseInt(label, 10) || 0;

/**
 * 24-hour strip with each alert window drawn at its own hour, directly under
 * the card's header. Answers a question the list below it does not: WHEN in
 * the day it gets tight — evening peak or morning trough. Ported from
 * proto/alerty's `w2` variant (the owner picked this one piece of that
 * prototype, not the rest of it) — geometry unchanged.
 *
 * `aria-hidden` on the whole thing: the status this draws is already said in
 * the text rows below, in words a screen reader can use, so the axis only
 * adds WHERE, never WHAT.
 *
 * Weight rides a second channel besides colour, so a reader who cannot tell
 * the two fills apart by hue still reads the shape: alarm fills the track
 * full height, warning sits inset within it.
 *
 * `data-os-doby` carries no value — it exists purely as a hook for measuring
 * on-screen alignment against the reserve chart's axis by hand, since a unit
 * test proves the constants agree with each other but not that the browser
 * actually painted them in the same place.
 *
 * Positioned by `dayAxisInset()` minus this card's own padding rather than by
 * any number written here: that is what makes it land at the same x as the
 * reserve chart's plot area in the card above (see shared.tsx) regardless of
 * which of the two cards' padding changes later.
 */
const DayAxis: React.FC<{ ranges: AlertRange[] }> = ({ ranges }) => {
  const inset = dayAxisInset();
  const trackInset = {
    marginLeft: Math.max(0, inset.left - ALERTS_CARD_PADDING_PX),
    marginRight: Math.max(0, inset.right - ALERTS_CARD_PADDING_PX),
  };

  return (
    <div aria-hidden data-os-doby="" className="mb-3" style={trackInset}>
      <div className="relative h-3.5 overflow-hidden rounded-full bg-surface-2">
        {ranges.map((range) => {
          const style = SEVERITY_STYLE[range.severity];
          const from = startHour(range.from);
          const span = Math.min(range.hours, 24 - from);
          return (
            <span
              key={`${range.severity}-${range.from}`}
              className={`absolute rounded-full ${style.bar} ${
                // Weight as a second channel: alarm runs the full height,
                // warning sits inset — the size cue points the same way as
                // the colour instead of contradicting it.
                range.severity === 'red'
                  ? 'top-0 bottom-0'
                  : 'top-[3px] bottom-[3px]'
              }`}
              style={{
                // 1px of slack on each side: two touching windows get a
                // track-coloured gap between them instead of a drawn border.
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
};

/**
 * Consecutive alert hours arrive pre-merged into ranges: a four-hour risk window
 * reads as one "17:00-21:00" entry instead of four near-identical rows.
 *
 * Hierarchy: the two numbers a reader decides on — the hour range and the
 * worst margin — sit in one line, one type size, one at the left edge and one
 * at the right, so they line up in columns down the whole list. Everything
 * else (severity label with its icon, the hour of the worst reading, reserve
 * and required) drops to a second, smaller line. "Najniższy margines" does
 * not repeat per row — it is said once, in the caption below the list.
 */
const AlertsPanel: React.FC<AlertsPanelProps> = ({
  ranges,
  currentDayOffset,
  hasData,
  isLoading = false,
  compassRanges = [],
  exchangeMissing = false,
}) => {
  const dayName = dayLabel(currentDayOffset);
  // Two separate totals, not one: a day that only ever touched the orange
  // band must not show the red pill (nor its "biały na czerwieni" reading of
  // severity) just because SOME hour somewhere needed attention.
  const redHours = ranges
    .filter((range) => range.severity === 'red')
    .reduce((sum, range) => sum + range.hours, 0);
  const orangeHours = ranges
    .filter((range) => range.severity === 'orange')
    .reduce((sum, range) => sum + range.hours, 0);

  /*
   * Below the alert list, above the Kompas block — the one place this app
   * already carries a note that qualifies the figures above it without
   * touching their color or status (see the two `text-text-tertiary`
   * paragraphs a few lines down). Shown in both branches below (with alerts
   * and without) since the caveat is about the day's data, not about whether
   * an alert happened to fire on it.
   */
  const exchangeNote = exchangeMissing ? (
    <p className="mt-2 text-[0.75rem] text-text-secondary">
      Saldo wymiany na tę dobę nie jest jeszcze zaplanowane — rezerwa liczona
      bez importu i eksportu. Plan dochodzi dzień wcześniej, dotąd zawsze
      między 13:15 a 14:00.
    </p>
  ) : null;

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[0.9375rem] font-semibold text-text">
          Alerty <span className="text-text-tertiary">· {dayName}</span>
        </h2>
        {(redHours > 0 || orangeHours > 0) && (
          <div className="flex shrink-0 items-center gap-1">
            {redHours > 0 && (
              <span
                className={`tnum rounded-full ${SEVERITY_STYLE.red.pill} px-2 py-0.5 text-[0.6875rem] font-semibold`}
              >
                {redHours} godz.
              </span>
            )}
            {orangeHours > 0 && (
              <span
                className={`tnum rounded-full ${SEVERITY_STYLE.orange.pill} px-2 py-0.5 text-[0.6875rem] font-semibold`}
              >
                {orangeHours} godz.
              </span>
            )}
          </div>
        )}
      </div>

      {/* No windows, no axis: an empty 24-hour strip would say "checked, all
          quiet" in a register the text branch below already owns (see
          "Brak alertów w tym dniu") — one axis with nothing on it adds
          nothing a reader can act on. */}
      {ranges.length > 0 && <DayAxis ranges={ranges} />}

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
        <div className="space-y-1.5">
          <Skeleton className="h-[3.25rem] w-full rounded-xl" />
          <Skeleton className="h-[3.25rem] w-full rounded-xl" />
        </div>
      ) : !hasData ? (
        // Without readings we cannot claim an all-clear — a green "no alerts"
        // here would present missing data as a confirmed safe state.
        <div className="rounded-xl bg-surface-2 px-3 py-3 text-[0.8125rem] text-text-tertiary">
          Brak danych dla tego dnia
        </div>
      ) : ranges.length === 0 ? (
        <div>
          <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-3 text-[0.8125rem] text-ok-text">
            <CheckIcon className="h-4 w-4 shrink-0" />
            Brak alertów w tym dniu
          </div>
          {exchangeNote}
          <CompassRows ranges={compassRanges} />
        </div>
      ) : (
        <div>
          <ul className="space-y-1.5 xl:grid xl:grid-cols-2 xl:gap-1.5 xl:space-y-0">
            {ranges.map((range) => {
              const style = SEVERITY_STYLE[range.severity];
              const rowLabel = marginLabel(
                SEVERITY_TO_STATUS[range.severity],
                range.worstDifference
              );
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
                      <span
                        className={`tnum text-[0.9375rem] font-semibold ${style.text}`}
                      >
                        {signedMW(range.worstDifference)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3">
                      <span
                        className={`flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold ${style.text}`}
                      >
                        <AlertIcon className="h-3.5 w-3.5" />
                        {rowLabel}
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
          {/* Wyjaśnia, dlaczego "Poniżej progu" bywa opisem dodatniego marginesu:
              próg czerwony w findAlerts to ostrzeżenie wyprzedzające (patrz
              marginLabel w status.ts), nie granica deficytu. */}
          <p className="text-[0.6875rem] text-text-tertiary">
            Próg alarmowy to ostrzeżenie wyprzedzające — margines może być
            jeszcze dodatni.
          </p>
          {exchangeNote}
          <CompassRows ranges={compassRanges} />
        </div>
      )}
    </section>
  );
};

export default AlertsPanel;
