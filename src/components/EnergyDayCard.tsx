import React from 'react';
import { ENERGY_DAY_GREETING } from '../utils/energyDay';

/**
 * Shown on 14 August and on no other day.
 *
 * Sits on its own rather than inside the analysis card, so it appears even when
 * there is no analysis to show — a greeting that depends on a scheduled job
 * having succeeded would be missing on precisely the wrong morning.
 *
 * Deliberately quiet, and deliberately not green. Green here is the OK status —
 * borrowing it would put a status colour on something that reports no status,
 * and the fourteenth of August is as likely as any day to carry an alarm. A
 * celebration sitting in reassuring green above a red chart would read as a
 * contradiction on the one morning nobody would think to check it.
 */
const EnergyDayCard: React.FC = () => (
  <section className="mx-3 mt-3 rounded-2xl bg-surface px-4 py-3 shadow-sm">
    <p className="text-[13px] leading-relaxed text-text-secondary">
      {ENERGY_DAY_GREETING}
    </p>
  </section>
);

export default React.memo(EnergyDayCard);
