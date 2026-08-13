import React from 'react';
import { ENERGY_DAY_GREETING, ENERGY_DAY_ORIGIN } from '../utils/energyDay';
import { BoltIcon } from './icons';

/**
 * Shown on 14 August and on no other day.
 *
 * Sits on its own rather than inside the analysis card, so it appears even when
 * there is no analysis to show — a greeting that depends on a scheduled job
 * having succeeded would be missing on precisely the wrong morning. Verified
 * against the clock set forward: at 09:00 on the fourteenth the summary written
 * the previous evening is already too old to display, and the greeting stands
 * there alone exactly as intended.
 *
 * Deliberately not green. Green here is the OK status — borrowing it would put a
 * status colour on something that reports no status, and the fourteenth of
 * August is as likely as any day to carry an alarm. A celebration sitting in
 * reassuring green above a red chart would read as a contradiction on the one
 * morning nobody would think to check it.
 *
 * The accent instead, which this app uses for things you can act on and for the
 * "teraz" line — a colour that marks something as worth the eye without claiming
 * anything about the grid. Tinted background, a filled bolt, and the provenance
 * underneath: once a year is worth three lines, and a reader who works in this
 * industry is more likely to want the reason for the date than another adjective.
 */
const EnergyDayCard: React.FC = () => (
  <section className="mx-3 mt-3 flex gap-3 rounded-2xl bg-accent-soft p-4 shadow-sm">
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
      aria-hidden
    >
      <BoltIcon className="h-5 w-5" />
    </span>

    <div className="min-w-0">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-accent-text">
        14 sierpnia
      </p>
      <p className="mt-0.5 text-[0.9375rem] font-semibold leading-snug text-text">
        {ENERGY_DAY_GREETING}
      </p>
      <p className="mt-1.5 text-[0.75rem] leading-relaxed text-text-secondary">
        {ENERGY_DAY_ORIGIN}
      </p>
    </div>
  </section>
);

export default React.memo(EnergyDayCard);
