/**
 * The one place a megawatt figure or a percentage becomes a string.
 *
 * Before this, `chart/shared.tsx`, `AlertsPanel.tsx`, `CurrentStatusCard.tsx`
 * and `TrendsSection.tsx` each carried their own `Intl.NumberFormat('pl-PL')`
 * instance and their own copy of the `value > 0 ? '+' : ''` sign logic —
 * four places that had to be kept in step by hand, and nothing that would have
 * caught them drifting apart.
 *
 * This is a refactor, not a change in behaviour: every caller's output must
 * come out byte-for-byte identical to what its own copy used to produce.
 */

const MW = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

/** A megawatt quantity, unsigned — e.g. "1 234". */
export const formatMW = (v: number) => MW.format(v);

/** A megawatt difference, always carrying its sign — e.g. "+1 234 MW". */
export const signedMW = (v: number) => `${v > 0 ? '+' : ''}${MW.format(v)} MW`;

/**
 * A signed percentage — e.g. "+3%" or "+3.5%" with `digits: 1`.
 *
 * `digits` is explicit rather than a single shared default because the
 * existing callers do not agree on it: TrendsSection's comparison rounds to
 * one decimal place, everywhere else rounds to a whole percent. Both
 * conventions are real and neither should be quietly merged into the other.
 */
export const formatPercent = (v: number, digits = 0) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
