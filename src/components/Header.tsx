import React from 'react';
import { SystemStatus } from '../types';
import {
  STATUS_DESCRIPTION,
  STATUS_HEADER_BG,
  STATUS_LABEL,
} from '../utils/status';
import { SettingsIcon } from './icons';

export type ConnectionState = 'loading' | 'online' | 'cached' | 'error';

/**
 * Same value for every state on purpose (see the ink comment on <header>
 * below): the dot used to carry connection state through four steps of white
 * opacity, which is not a contrast question this fix is answering — wording
 * in `connectionText` is what actually says "cached" / "loading" / "error".
 */
const CONNECTION_DOT: Record<ConnectionState, string> = {
  loading: 'bg-black/70',
  online: 'bg-black/70',
  cached: 'bg-black/70',
  error: 'bg-black/70',
};

interface HeaderProps {
  status: SystemStatus;
  connection: ConnectionState;
  connectionText: string;
  onToggleSettings: () => void;
}

/**
 * Status-coloured app bar. The colour carries the headline information, so the
 * current state of the system is readable from across the room without parsing
 * any numbers.
 *
 * `padding-top` picks up the safe-area inset here rather than on <body>: the
 * background then extends under the notch while the content stays clear of it,
 * which a sticky element cannot achieve if the inset lives on an ancestor.
 *
 * Ink is black, not white, on all four backgrounds — measured: white on
 * --l-ok/--l-warn sits at 2.2:1, on --l-alarm at 3.55:1, all below the 4.5:1
 * floor for 11-17px semibold text. Black clears every combination (9.46 /
 * 9.55 / 5.92:1, and 6.44:1 on the "unknown" grey), which is why iOS itself
 * puts dark ink on its own yellow and green surfaces rather than white. Three
 * steps carry the hierarchy the way the three white-opacity steps used to:
 * #000 on the status label (text-black), 85% on the description
 * (text-black/85), 80% on the connection line (text-black/80). The bar's own
 * colour is untouched — STATUS_HEADER_BG, --l-ok/--l-warn/--l-alarm and
 * STATUS_THEME_COLOR stay exactly what they were; only the letters on top of
 * them changed. The settings icon is deliberately left off this list: it
 * keeps the header's base `text-white` (via `currentColor`), which is why
 * that class is still on <header> even though no text node reads it anymore.
 */
const Header: React.FC<HeaderProps> = ({
  status,
  connection,
  connectionText,
  onToggleSettings,
}) => (
  <header
    className={`sticky top-0 z-50 text-white transition-colors duration-500 ${STATUS_HEADER_BG[status]}`}
    style={{ paddingTop: 'env(safe-area-inset-top)' }}
  >
    {/* The bar itself stays full width so its status colour reaches both edges
        of the screen; only its contents line up with the column below. */}
    <div className="content-width flex items-center gap-3 px-4 h-14">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {/* shrink-0: the label is the headline and must never be the thing
              that gets clipped — the description absorbs the overflow. */}
          <h1 className="shrink-0 text-[1.0625rem] font-semibold leading-tight text-black">
            {STATUS_LABEL[status]}
          </h1>
          <span className="min-w-0 truncate text-[0.8125rem] text-black/85">
            {STATUS_DESCRIPTION[status]}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[0.6875rem] text-black/80">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${CONNECTION_DOT[connection]}`}
          />
          <span className="truncate">{connectionText}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleSettings}
        aria-label="Ustawienia"
        className="grid place-items-center w-11 h-11 -mr-2 rounded-full active:bg-white/15"
      >
        <SettingsIcon />
      </button>
    </div>
  </header>
);

export default React.memo(Header);
