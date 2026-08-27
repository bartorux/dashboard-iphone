import React from 'react';
import { Summary } from '../hooks/useSummary';
import { usePersistentFlag } from '../hooks/usePersistentFlag';
import { ChevronDownIcon } from './icons';

interface SummaryCardProps {
  summary: Summary;
  /** Reader's own clock, so the span is named relative to their today. */
  now: Date;
}

const timeFormat = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Prose only, and no figures of its own.
 *
 * Every number on this screen comes from our own arithmetic — the margin sits in
 * the card directly above, the hours in the chart below. Repeating them here
 * would add text to a screen already asked twice to carry less of it, and would
 * put a second, unverified copy of each figure on the page.
 */
// Sizes in rem, like everywhere else, so the reader's iPhone text-size setting
// carries through — see the root rule in App.css for how it is hooked up.
const SummaryCard: React.FC<SummaryCardProps> = ({ summary, now }) => {
  const [expanded, setExpanded] = usePersistentFlag('summary-expanded', true);

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      {/* The label sits above the text, not below it. As a footer it said what
          you had just read only once you had read it, and left the card
          indistinguishable from every other one. Here it does three jobs at no
          cost in height: names the days covered — without which the card looks
          merely unrefreshed when the day tabs are switched and it does not
          follow — marks the prose as a model's, and sets the card apart from the
          figures around it. */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 truncate text-[0.6875rem] text-text-tertiary">
            {/* No day range here any more. It read "dziś–pon.", the same span
                the tabs below already show, and knowing it changed nothing —
                this card is about what is coming, not about which dates were
                consulted. The time stays: how old the text is, a reader does
                check. */}
            Analiza AI
          {` · ${timeFormat.format(new Date(summary.generatedAt))}`}
        </span>
        {/* Same curve as .collapsible in App.css, so the chevron and the
            section it points at settle into place together. */}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      {/* The headline survives collapsing: it is the answer, and a card folded
          down to nothing but its own label would be worth less than no card. */}
      <p className="mt-1.5 text-[0.9375rem] font-semibold leading-snug text-text">
        {summary.headline}
      </p>

      <div className="collapsible" data-collapsed={!expanded}>
        <div>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-text-secondary">
            {/* Joined rather than interpolated with a space: TREŚĆ is absent
                by design on a quiet period, and a bare space would open the
                paragraph with one. */}
            {[summary.body, summary.outlook].filter(Boolean).join(' ')}
          </p>
        </div>
      </div>
    </section>
  );
};

export default React.memo(SummaryCard);
