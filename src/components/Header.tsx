import React from 'react';
import { SystemStatus } from '../types';
import { STATUS_DESCRIPTION, STATUS_LABEL } from '../utils/status';
import { CloudOffIcon, SettingsIcon } from './icons';

export type ConnectionState = 'loading' | 'online' | 'cached' | 'error';

/**
 * Class maps are written out in full so Tailwind's scanner sees every literal
 * (see status.ts). The capsule borrows the card badge's own pairing — a -soft
 * fill under -text ink — so the bar and the card speak one status language.
 * Not STATUS_SOFT_BG for "unknown": --surface-2 is the page grey in light
 * mode and all but disappears on the bar's material.
 */
const CAPSULE: Record<SystemStatus, string> = {
  ok: 'bg-ok-soft text-ok-text',
  warn: 'bg-warn-soft text-warn-text',
  alarm: 'bg-alarm-soft text-alarm-text',
  unknown: 'bg-surface-3 text-text-secondary',
};

/** The vivid hue, matching the line under the bar, which -text ink is not. */
const CAPSULE_DOT: Record<SystemStatus, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  alarm: 'bg-alarm',
  unknown: 'bg-status-unknown',
};

interface HeaderProps {
  status: SystemStatus;
  connection: ConnectionState;
  /** Second line: when the figures were fetched. Empty hides it. */
  connectionText: string;
  onToggleSettings: () => void;
  /** Offered only when there is nothing to show; see the error branch. */
  onRetry?: () => void;
}

/**
 * App bar: a translucent material with the status in a capsule.
 *
 * It used to be painted edge to edge in the status colour, readable from
 * across the room. That made it the loudest thing on screen — brightest of
 * all in dark mode — and the word in it (about the next few hours) sat right
 * above the card's own badge (about this hour), so the two looked like they
 * disagreed. The colour now lives in the capsule and in a 3px line under the
 * bar (`.app-bar[data-status]` in App.css); the bar itself is surface, like a
 * navigation bar in iOS, and content scrolls under it.
 *
 * Loading and failure are not system states and must not look like one: the
 * old bar said "Brak danych · Brak danych do oceny · Pobieranie danych…" on
 * every cold start. Both now replace the status capsule with their own, carry
 * no status colour, and say what is happening exactly once.
 *
 * `padding-top` picks up the safe-area inset here rather than on <body>: the
 * material then extends under the notch while the content stays clear of it,
 * which a sticky element cannot achieve if the inset lives on an ancestor.
 */
const Header: React.FC<HeaderProps> = ({
  status,
  connection,
  connectionText,
  onToggleSettings,
  onRetry,
}) => {
  const isLoading = connection === 'loading';
  const isError = connection === 'error';
  // While loading, a status computed from the cache has not been confirmed,
  // and the bar says so by not colouring anything yet.
  const lineStatus = isLoading || isError || status === 'unknown' ? undefined : status;
  const showRetry = isError && onRetry !== undefined;
  const hasSecondLine = connectionText !== '' || showRetry;

  let capsule: React.ReactNode;
  let description: string;
  if (isLoading) {
    capsule = (
      <>
        <span
          aria-hidden="true"
          data-testid="header-spinner"
          className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
        Ładowanie
      </>
    );
    description = 'Pobieranie danych z PSE…';
  } else if (isError) {
    capsule = (
      <>
        <CloudOffIcon className="h-[0.875rem] w-[0.875rem] shrink-0" />
        Offline
      </>
    );
    description = 'Brak połączenia z PSE';
  } else {
    capsule = (
      <>
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${CAPSULE_DOT[status]}`}
        />
        {STATUS_LABEL[status]}
      </>
    );
    // Names its horizon ("Najbliższe godziny …") — see STATUS_DESCRIPTION.
    description = STATUS_DESCRIPTION[status];
  }

  return (
    <header
      className="app-bar sticky top-0 z-50"
      data-status={lineStatus}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* The material stays full width; only the contents line up with the
          column below. From 48rem the side padding is the cards' own 12px
          gutter, so the capsule starts where the cards do (16px against 28px
          on a monitor before). The phone keeps iOS's 16px bar margin. */}
      <div className="content-width">
        <div className="flex h-14 items-center gap-3 px-4 md:px-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex min-w-0 items-center gap-2 leading-tight">
              {/* shrink-0: the capsule is the headline and must never be the
                  thing that gets clipped — the description absorbs the overflow. */}
              <span
                data-testid="header-capsule"
                className={`inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[0.8125rem] font-bold tracking-[0.02em] ${
                  isLoading || isError ? CAPSULE.unknown : CAPSULE[status]
                }`}
              >
                {capsule}
              </span>
              <span className="min-w-0 truncate text-[0.8125rem] font-medium text-text">
                {description}
              </span>
            </h1>
            {hasSecondLine && (
              <div
                data-testid="header-connection"
                className="mt-0.5 flex items-center gap-1 text-[0.6875rem] text-text-tertiary contrast-more:text-text-secondary"
              >
                {/* The only mark on this line, and only when something is off:
                    online needs no badge, and a dot that looked the same in
                    all four states (as it used to) said nothing. */}
                {connection === 'cached' && (
                  <CloudOffIcon className="h-3 w-3 shrink-0" />
                )}
                {connectionText !== '' && (
                  <span className="truncate">{connectionText}</span>
                )}
                {showRetry && (
                  <>
                    {connectionText !== '' && <span aria-hidden="true">·</span>}
                    <button
                      type="button"
                      onClick={onRetry}
                      // The pseudo-element widens the hit area to about 44px
                      // tall without making the 11px line itself any taller.
                      className="relative font-semibold text-accent-text active:opacity-50 before:absolute before:-inset-x-2 before:-inset-y-3.5"
                    >
                      Ponów
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleSettings}
            aria-label="Ustawienia"
            // Accent on the material in every state: it used to inherit white
            // from a bar whose colour changed under it, and on OK/UWAGA it all
            // but disappeared. -mr-3 from 48rem puts the glyph's right edge on
            // the cards' right edge, mirroring the left padding.
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-accent active:opacity-50 md:-mr-3"
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
    </header>
  );
};

export default React.memo(Header);
