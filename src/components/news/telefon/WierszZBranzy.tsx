import React, { useCallback, useState } from 'react';
import { ChevronDownIcon } from '../../icons';
import { formatClock } from '../../../utils/news';
import ArkuszTelefon from './ArkuszTelefon';
import { listNames, newFromAuthorities, type WejscieProps } from './wspolne';

/**
 * "Z branży" on a phone: one row under the AI summary, opening the sheet.
 * Chosen 12.10.2026 and kept after a week of use (22.10.2026).
 *
 * Chosen over the header icon, which did not read as something to tap: a
 * named row ending in a chevron is how iOS says "this opens", the same shape
 * as a row in Settings. Black and grey only — every colour on this screen
 * already means a level of risk, and nothing secondary may look like one.
 * The header stays whole for the status line.
 *
 * Only new items from PSE and URE change what it says ("nowe od PSE i URE"),
 * with no number and no colour; press headlines leave it at "stan HH:MM".
 */
const WierszZBranzy: React.FC<WejscieProps> = ({ news, now, stale, isNew, onArticleOpen, onSeen }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    onSeen();
  }, [onSeen]);

  const authorities = stale ? [] : newFromAuthorities(news, isNew);
  const detail = stale
    ? `stan ${formatClock(news.generatedAt)}, nieaktualne`
    : authorities.length > 0
    ? `nowe od ${listNames(authorities)}`
    : `stan ${formatClock(news.generatedAt)}`;

  return (
    <div className="mx-3 mt-3">
      <button
        type="button"
        // Two spans side by side would be read as one word, "Z branżystan".
        aria-label={`Z branży, ${detail}`}
        aria-haspopup="dialog"
        data-z-branzy-otworz
        onClick={() => setOpen(true)}
        // news-row: the same instant press fill as a headline row, no scaling.
        className="news-row flex min-h-11 w-full items-center gap-2 rounded-xl bg-surface pl-4 pr-3 text-left shadow-sm"
      >
        <span className="shrink-0 text-[0.9375rem] text-text">Z branży</span>
        <span
          className={`min-w-0 flex-1 truncate text-right text-[0.9375rem] tnum ${
            authorities.length > 0 ? 'text-text-secondary' : 'text-text-tertiary'
          }`}
        >
          {detail}
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 -rotate-90 text-text-tertiary" />
      </button>
      <ArkuszTelefon open={open} news={news} now={now} isNew={isNew} onClose={close} onArticleOpen={onArticleOpen} />
    </div>
  );
};

export default WierszZBranzy;
