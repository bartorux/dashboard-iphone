import React from 'react';

/**
 * One shape of "not yet", for the whole app.
 *
 * Three different waits were being drawn three different ways: the chart body
 * pulsed a rounded box, the status card printed "Brak odczytu" in tertiary ink,
 * and the alerts panel stated "Brak danych dla tego dnia" — which during the
 * first fetch of a session is not a slow answer but a wrong one. The chart's
 * treatment was the one that was already right, so it becomes the language and
 * the other two adopt it.
 *
 * Used ONLY where there is nothing yet to show: the first fetch of the session,
 * with the state still empty. Never on a refetch. Data stays in state across a
 * refresh, so putting a skeleton there would blank a screen that is currently
 * correct and replace figures the reader is mid-sentence with — the
 * "skeleton flash on refetch" anti-pattern. The header's connection line is
 * where a refresh announces itself, and it already does.
 *
 * aria-hidden, and no text: a screen reader is told the region is busy by the
 * live connection status, not by a decorative box. Announcing a placeholder
 * would put a second, meaningless "loading" in the reading order.
 */
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />
);

export default Skeleton;
