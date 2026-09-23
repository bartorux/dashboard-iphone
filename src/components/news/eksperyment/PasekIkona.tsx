import React, { useCallback, useState } from 'react';
import ArkuszTelefon from './ArkuszTelefon';
import type { WejscieProps } from './wspolne';

/** Three lines, each shorter than the one above: a list of headlines, not a menu. */
const HeadlinesIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    aria-hidden
    className="h-5 w-5"
  >
    <path d="M4 6h16M4 12h11M4 18h6" />
  </svg>
);

/**
 * "Z branży" as an icon in the header, beside the gear — the "pasek" variant
 * of the experiment (useNewsExperiment). Header only gives it a place; App
 * decides whether it is there at all.
 *
 * Accent like the gear, and no count on it: a badge would need a colour, and
 * every colour on this screen already means something (see NewsCard).
 */
const PasekIkona: React.FC<WejscieProps> = ({ news, now, isNew, onArticleOpen, onSeen }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    onSeen();
  }, [onSeen]);

  return (
    <>
      <button
        type="button"
        aria-label="Z branży"
        aria-haspopup="dialog"
        data-z-branzy-otworz
        onClick={() => setOpen(true)}
        // -mr-3 takes back the header's 12px gap, so the two glyphs stand as
        // a pair at the end of the bar rather than the icon floating free.
        className="-mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-accent active:opacity-50"
      >
        <HeadlinesIcon />
      </button>
      <ArkuszTelefon open={open} news={news} now={now} isNew={isNew} onClose={close} onArticleOpen={onArticleOpen} />
    </>
  );
};

export default PasekIkona;
