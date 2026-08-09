import React from 'react';
import { Summary } from '../hooks/useSummary';

interface SummaryCardProps {
  summary: Summary;
}

const timeFormat = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Prose only, and no figures of its own.
 *
 * Every number on this screen comes from our own arithmetic — the margin sits
 * in the card directly below, the hours in the chart under that. Repeating them
 * here would add text to a screen already asked twice to carry less of it, and
 * would put a second, unverified copy of each figure on the page.
 */
const SummaryCard: React.FC<SummaryCardProps> = ({ summary }) => (
  <section className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm">
    <p className="text-[15px] font-semibold leading-snug text-text">
      {summary.headline}
    </p>

    <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
      {summary.body} {summary.outlook}
    </p>

    {/* Said plainly: the wording is a model's, the assessment behind it is not. */}
    <p className="mt-2 text-[11px] text-text-tertiary">
      Opis AI · {timeFormat.format(new Date(summary.generatedAt))}
    </p>
  </section>
);

export default React.memo(SummaryCard);
