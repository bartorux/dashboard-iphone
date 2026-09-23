import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '../../icons';
import { formatClock } from '../../../utils/news';
import ArkuszTelefon from './ArkuszTelefon';
import { countNew, newLabel, type WejscieProps } from './wspolne';
import './eksperyment.css';

/**
 * "Z branży" as a bar fixed to the foot of the screen, whatever the scroll —
 * the "dol" variant of the experiment (useNewsExperiment).
 *
 * Rendered into <body>, not inside the page: when the settings sheet makes the
 * page recede it transforms #root, and a fixed element inside a transformed
 * one is fixed to that element instead — the bar would drop to the far end of
 * the page for as long as the settings are open, then pop back.
 *
 * 48px plus the safe area under the home indicator. The page keeps a strip of
 * those 48px at its foot, so the last thing on it ("Odśwież") can still be
 * scrolled clear of the bar; the safe area is not in the strip, because the
 * refresh button's cell already pads for it.
 */
const PasekDolny: React.FC<WejscieProps> = ({ news, now, stale, isNew, onArticleOpen, onSeen }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    onSeen();
  }, [onSeen]);

  const fresh = countNew(news, isNew);
  const detail = stale
    ? `stan ${formatClock(news.generatedAt)}, nieaktualne`
    : fresh > 0
    ? newLabel(fresh)
    : `stan ${formatClock(news.generatedAt)}`;

  return (
    <>
      <div aria-hidden data-z-branzy-odstep className="h-12 shrink-0" />
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="zb-bar fixed inset-x-0 bottom-0 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <button
              type="button"
              aria-haspopup="dialog"
              data-z-branzy-otworz
              onClick={() => setOpen(true)}
              className="flex h-12 w-full items-center gap-2 px-4 text-left active:opacity-60"
            >
              <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
                <span className="font-semibold text-text">Z branży</span>
                <span className={!stale && fresh > 0 ? 'text-text-secondary' : 'text-text-tertiary'}>{` · ${detail}`}</span>
              </span>
              {/* Up: the list rises from here. */}
              <ChevronDownIcon className="h-4 w-4 shrink-0 rotate-180 text-text-tertiary" />
            </button>
          </div>,
          document.body
        )}
      <ArkuszTelefon open={open} news={news} now={now} isNew={isNew} onClose={close} onArticleOpen={onArticleOpen} />
    </>
  );
};

export default PasekDolny;
