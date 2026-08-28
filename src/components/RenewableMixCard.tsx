import React, { useMemo } from 'react';
import { PSEDataPoint } from '../types';
import { HOUR_MS } from '../utils/constants';
import { renewableMixShare } from '../utils/renewableShare';

interface RenewableMixCardProps {
  /** Today's points only — PSE publishes kseDemand for the current business
   *  day alone, so this card never has an honest answer for any other day. */
  points: PSEDataPoint[];
  /** Country-wide demand per hour, keyed by hour START epoch ms — same shape
   *  and convention `useKseDemand` returns, so callers pass it straight through. */
  kseDemand: Map<number, number>;
  now: Date;
}

interface HourSlot {
  hour: number;
  hourLabel: string;
  share: number | null;
}

const RING_RADIUS = 50;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The block whose window contains `now` — the same "first period not yet
 * ended" rule as `findCurrentPoint` in dataTransform, reimplemented against a
 * caller-supplied instant rather than the wall clock. Kept local rather than
 * imported so this component stays testable with an arbitrary `now` prop
 * instead of having to mock global time.
 */
function findCurrent(points: PSEDataPoint[], now: Date): PSEDataPoint | undefined {
  const nowMs = now.getTime();
  return points.find((point) => point.time.getTime() > nowMs);
}

function shareFor(
  point: PSEDataPoint | undefined,
  kseDemand: Map<number, number>
): number | null {
  if (!point) return null;
  const hourStart = point.time.getTime() - HOUR_MS;
  return renewableMixShare(point.pv, point.wind, kseDemand.get(hourStart) ?? null, point.exchange);
}

/**
 * "OZE w miksie · teraz" — a ring for the current hour's renewable share plus
 * a 24-bar strip for the rest of the business day, both fed by the one shared
 * formula in renewableShare.ts.
 *
 * Scoped to today on purpose. pdgobpkd (the source of kseDemand) is published
 * for the CURRENT business day only, so this card has nothing honest to say
 * about any other day — rather than a placeholder, it renders nothing at all
 * once either the whole map is empty or the current hour itself has no share.
 */
const RenewableMixCard: React.FC<RenewableMixCardProps> = ({ points, kseDemand, now }) => {
  const currentPoint = useMemo(() => findCurrent(points, now), [points, now]);
  const currentShare = useMemo(
    () => shareFor(currentPoint, kseDemand),
    [currentPoint, kseDemand]
  );

  const slots = useMemo<HourSlot[]>(() => {
    const byHour = new Map<number, PSEDataPoint>();
    for (const point of points) {
      const hour = Number.parseInt(point.hourLabel, 10);
      if (Number.isFinite(hour)) byHour.set(hour, point);
    }
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${pad2(hour)}:00`,
      share: shareFor(byHour.get(hour), kseDemand),
    }));
  }, [points, kseDemand]);

  // No placeholder: PSE not having published kseDemand yet (or at all, for
  // any day but today) is the endpoint's normal state, not an error to explain.
  if (currentPoint === undefined || currentShare === null) return null;

  const dashoffset = RING_CIRCUMFERENCE * (1 - currentShare / 100);
  const currentHour = Number.parseInt(currentPoint.hourLabel, 10);

  return (
    <section
      className="mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-sm"
      aria-label={`OZE w krajowym miksie, godzina ${currentPoint.hourLabel}: ${currentShare}%`}
    >
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0">
          {/*
            Colour rides on Tailwind classes bound to the theme's --color-*
            tokens, not the `stroke` attribute directly: an SVG presentation
            attribute reads its value as a literal paint string, so
            stroke="var(--accent)" does not resolve the way it would inside
            real CSS — the same trap useChartColors.ts reads computed styles
            in JS to avoid for Recharts. A class compiles to an actual CSS
            rule, where var() resolves and repaints itself on a theme switch
            with no JS involved.
          */}
          <svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90" aria-hidden="true">
            <circle
              cx={60}
              cy={60}
              r={RING_RADIUS}
              fill="none"
              className="stroke-accent-soft"
              strokeWidth={12}
            />
            <circle
              className="oze-ring-fill stroke-accent"
              cx={60}
              cy={60}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashoffset}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="tnum text-2xl font-semibold text-text">{currentShare}%</span>
          </div>
        </div>

        <div>
          <div className="text-[0.8125rem] font-semibold text-text">OZE w krajowym miksie</div>
          <div className="text-[0.6875rem] text-text-tertiary">
            {currentPoint.hourLabel}&ndash;{currentPoint.endLabel}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex h-16 items-end gap-[2px]">
          {slots.map((slot) => (
            <div
              key={slot.hour}
              data-testid="oze-hour-slot"
              className="flex h-full flex-1 items-end"
            >
              {slot.share === null ? (
                <div className="h-0.5 w-full rounded-full bg-separator" />
              ) : (
                <div
                  title={`${slot.hourLabel} · ${slot.share}%`}
                  style={{ height: `${Math.max(slot.share, 3)}%` }}
                  className={`w-full rounded-t-sm ${
                    slot.hour === currentHour ? 'bg-accent' : 'bg-accent opacity-60'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[0.625rem] text-text-tertiary">
          <span>00</span>
          <span>12</span>
          <span>23</span>
        </div>
      </div>
    </section>
  );
};

export default RenewableMixCard;
