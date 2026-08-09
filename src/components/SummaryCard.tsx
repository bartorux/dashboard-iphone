import React from 'react';
import { Summary } from '../hooks/useSummary';
import { dayRangeLabel } from '../utils/dayLabels';

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
const SummaryCard: React.FC<SummaryCardProps> = ({ summary, now }) => {
  const span = dayRangeLabel(summary.dates, now);

  return (
    <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
      {/* Above the text, not below it.
          As a footer this said what you had just read only once you had read it,
          and left the card indistinguishable from every other one on the screen.
          Here it does three jobs at no cost in height: names the days covered —
          without which the card looks merely unrefreshed when the day tabs are
          switched and it does not follow — marks the prose as a model's, and
          sets the card apart from the figures around it. */}
      <p className="text-[11px] text-text-tertiary">
        Analiza AI
        {span && ` · ${span}`}
        {` · ${timeFormat.format(new Date(summary.generatedAt))}`}
      </p>

      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-text">
        {summary.headline}
      </p>

      <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
        {summary.body} {summary.outlook}
      </p>
    </section>
  );
};

export default React.memo(SummaryCard);
