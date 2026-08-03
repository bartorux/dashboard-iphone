import React from 'react';
import { SystemStatus } from '../types';
import {
  STATUS_DESCRIPTION,
  STATUS_HEADER_BG,
  STATUS_LABEL,
} from '../utils/status';
import { BellIcon, BellOffIcon, SettingsIcon } from './icons';

export type ConnectionState = 'loading' | 'online' | 'cached' | 'error';

const CONNECTION_DOT: Record<ConnectionState, string> = {
  loading: 'bg-white/60',
  online: 'bg-white',
  cached: 'bg-white/70',
  error: 'bg-white/40',
};

interface HeaderProps {
  status: SystemStatus;
  connection: ConnectionState;
  connectionText: string;
  notificationsSilenced: boolean;
  onToggleNotifications: () => void;
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
 */
const Header: React.FC<HeaderProps> = ({
  status,
  connection,
  connectionText,
  notificationsSilenced,
  onToggleNotifications,
  onToggleSettings,
}) => (
  <header
    className={`sticky top-0 z-50 text-white transition-colors duration-500 ${STATUS_HEADER_BG[status]}`}
    style={{ paddingTop: 'env(safe-area-inset-top)' }}
  >
    <div className="flex items-center gap-3 px-4 h-14">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {/* shrink-0: the label is the headline and must never be the thing
              that gets clipped — the description absorbs the overflow. */}
          <h1 className="shrink-0 text-[17px] font-semibold leading-tight">
            {STATUS_LABEL[status]}
          </h1>
          <span className="min-w-0 truncate text-[13px] text-white/80">
            {STATUS_DESCRIPTION[status]}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/75">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${CONNECTION_DOT[connection]}`}
          />
          <span className="truncate">{connectionText}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleNotifications}
        aria-pressed={notificationsSilenced}
        aria-label={
          notificationsSilenced
            ? 'Włącz powiadomienia'
            : 'Wycisz powiadomienia'
        }
        className={`grid place-items-center w-11 h-11 -mr-1 rounded-full transition-opacity active:bg-white/15 ${
          notificationsSilenced ? 'opacity-50' : 'opacity-100'
        }`}
      >
        {notificationsSilenced ? <BellOffIcon /> : <BellIcon />}
      </button>

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
