import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  endLabel: string;
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
      endLabel: `${pad2((hour + 1) % 24)}:00`,
      share: shareFor(byHour.get(hour), kseDemand),
    }));
  }, [points, kseDemand]);

  // The hour under the pointer/finger while a gesture is actively in
  // progress (mouse hover anywhere on the strip, or a touch/pen currently
  // down), or null when nothing is being touched right now. Index into
  // `slots` directly (hour === slots[hour].hour by construction) rather than
  // searching — cheap and always in range because hourFromClientX below
  // clamps to 0-23.
  const [scrubHour, setScrubHour] = useState<number | null>(null);
  // Touch/pen only: the hour a tap or drag left pinned after release, showing
  // until it's explicitly cleared (see the three release paths below). Mouse
  // never sets this — a mouse can always re-hover, so there is nothing for it
  // to hold onto.
  const [latchedHour, setLatchedHour] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  /**
   * Unlatch path (b): a tap anywhere outside the strip. Scoped to only run
   * while something is actually latched — with nothing latched there is
   * nothing to listen for, and the listener attaches/detaches itself as
   * latchedHour changes rather than living for the component's whole life.
   * Capture phase, so an ancestor's stopPropagation elsewhere on the page
   * can't hide the tap from us.
   */
  useEffect(() => {
    if (latchedHour === null) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const strip = stripRef.current;
      if (strip && !strip.contains(event.target as Node)) {
        setLatchedHour(null);
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [latchedHour]);

  // No placeholder: PSE not having published kseDemand yet (or at all, for
  // any day but today) is the endpoint's normal state, not an error to explain.
  if (currentPoint === undefined || currentShare === null) return null;

  const currentHour = Number.parseInt(currentPoint.hourLabel, 10);

  /**
   * Bar index from a pointer's clientX, computed against the strip
   * container's own box rather than per-bar hit-testing: once a touch drag
   * has called setPointerCapture (below), every subsequent pointermove keeps
   * targeting the captured element even as the finger crosses bar
   * boundaries, so per-bar handlers would stop firing mid-drag. Measuring
   * position against the container is what keeps the drag continuous.
   */
  const hourFromClientX = (clientX: number): number | null => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.999999);
    return Math.floor(ratio * 24);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const hour = hourFromClientX(event.clientX);
    if (hour !== null) setScrubHour(hour);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Capture so a touch drag keeps reporting to this element even once the
    // finger strays outside the strip's bounds. Feature-detected: real
    // pointers all support it, but jsdom's PointerEvent (used in tests)
    // does not implement capture at all.
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    handlePointerMove(event);
  };

  const isTouchLike = (pointerType: string) => pointerType === 'touch' || pointerType === 'pen';

  /**
   * Release. A mouse can always come back and re-hover, so it just snaps back
   * to now (unchanged from before this feedback round). Touch/pen is
   * different: on a phone the reading would flash and vanish before it could
   * be read (the reported bug), and the finger itself is sitting over the bar
   * it just picked, blocking the view — so a tap or a drag-then-release
   * instead PINS the reading on the hour it landed on. Tapping that same
   * pinned hour again is the natural "undo" gesture, so it releases the pin;
   * tapping or dragging-to elsewhere just moves the pin there directly,
   * without requiring an unlatch step first.
   */
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isTouchLike(event.pointerType)) {
      setScrubHour(null);
      return;
    }
    if (scrubHour !== null) {
      setLatchedHour((prev) => (scrubHour === prev ? null : scrubHour));
    }
    setScrubHour(null);
  };

  // Sliding off the strip: mouse-hover semantics only. A captured touch does
  // not fire this mid-gesture (capture keeps it targeted at the strip until
  // release/cancel), so this path is effectively mouse-only in practice —
  // it deliberately never touches latchedHour.
  const endHover = () => setScrubHour(null);

  // Unlatch path (c): the page's own scroll stealing the touch (touch-action:
  // pan-y below) fires this instead of pointerup — a full revert, the same
  // as if nothing had ever been touched, so any existing latch goes too.
  const handlePointerCancel = () => {
    setScrubHour(null);
    setLatchedHour(null);
  };

  const activeHour = scrubHour ?? latchedHour;
  const activeSlot = activeHour === null ? undefined : slots[activeHour];
  const headlineShare = activeSlot ? activeSlot.share : currentShare;
  const headlineHourLabel = activeSlot ? activeSlot.hourLabel : currentPoint.hourLabel;
  const headlineEndLabel = activeSlot ? activeSlot.endLabel : currentPoint.endLabel;
  // An hour with no data gets an honest dash, not a fabricated percentage —
  // consistent with the empty slots the strip already renders for gaps, and
  // with why this whole card returns null rather than guess at a number.
  const headlineText = headlineShare === null ? '—' : `${headlineShare}%`;
  const dashoffset = RING_CIRCUMFERENCE * (1 - (headlineShare ?? 0) / 100);

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

            --oze, not --accent: this ring is data (this hour's renewable
            share), and --accent is reserved elsewhere in this app for things
            you can act on and the "teraz" marker in charts — the same hue as
            the "Odśwież" button sitting in this same column on wide screens.
            See the --l-oze comment in App.css for the contrast numbers and
            why PV's orange was rejected (too close to --warn).
          */}
          <svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90" aria-hidden="true">
            <circle
              cx={60}
              cy={60}
              r={RING_RADIUS}
              fill="none"
              className="stroke-oze-soft"
              strokeWidth={12}
            />
            {/*
              data-scrub says whether a finger or pointer is on the strip
              RIGHT NOW, and the CSS rule it drives (App.css, .oze-ring-fill)
              zeroes the transition duration while it is true.

              Deliberately keyed on scrubHour, not on `activeHour`. A latched
              hour is not a gesture in progress: the reading was pinned, the
              finger is gone, and the next change to it — a tap on another bar,
              or the release back to "teraz" — is the ring moving on its own
              again and gets the full 600ms curve. Only the live drag, where
              the arc is the finger's own output, has to be instant.
            */}
            <circle
              className="oze-ring-fill stroke-oze"
              data-scrub={scrubHour !== null}
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
            <span className="tnum text-2xl font-semibold text-text">{headlineText}</span>
          </div>
        </div>

        <div>
          <div className="text-[0.8125rem] font-semibold text-text">OZE w krajowym miksie</div>
          <div className="text-[0.6875rem] text-text-tertiary">
            {headlineHourLabel}&ndash;{headlineEndLabel}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {/*
          touch-pan-y: lets a mostly-vertical touch drag fall through to the
          page's own scroll (pointercancel fires here, which handlePointerCancel
          already treats as "stop scrubbing, drop any latch too") while a
          horizontal drag stays JS's to handle — the same split the chart's
          own gestures rely on elsewhere.
        */}
        <div
          ref={stripRef}
          data-testid="oze-hour-strip"
          className="flex h-16 touch-pan-y items-end gap-[2px]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={endHover}
        >
          {slots.map((slot) => {
            // Covers both an in-progress gesture and a touch's post-release
            // latch — the bar being read stays marked either way, since a
            // latched reading with no visible mark would leave nothing on
            // screen pointing at what the header is now showing.
            const isSelected = slot.hour === activeHour;
            // "HH:00 · NN%" (or "· —" for a gap) is the one honest accessible
            // name for a bar that has no visible label of its own — a plain
            // aria-label rather than a listbox/slider role/pattern, because
            // this interaction only ever fires from a pointer or touch drag;
            // claiming a slider role without keyboard support would be a
            // pattern accessibility tooling can't actually rely on. `title`
            // is dropped as a redundant, delayed duplicate of the live
            // percent/hour the header now shows on first touch.
            const ariaLabel =
              slot.share === null ? `${slot.hourLabel} · —` : `${slot.hourLabel} · ${slot.share}%`;
            return (
              <div
                key={slot.hour}
                data-testid="oze-hour-slot"
                className="flex h-full flex-1 items-end"
              >
                {slot.share === null ? (
                  <div
                    aria-label={ariaLabel}
                    className={`h-0.5 w-full rounded-full ${
                      isSelected ? 'bg-text-secondary' : 'bg-separator'
                    }`}
                  />
                ) : (
                  <div
                    aria-label={ariaLabel}
                    style={{ height: `${Math.max(slot.share, 3)}%` }}
                    className={`w-full rounded-t-sm bg-oze ${
                      // The scrub target needs its own mark, distinguishable
                      // from the current-hour ring below rather than a
                      // reskin of it — the two can be true at once (scrubbing
                      // the current hour itself) and neither may silently
                      // swallow the other. A heavier ring in a darker neutral
                      // (ring-2 text vs ring-1 text-secondary) reads as "held"
                      // next to "now", by weight rather than hue — the same
                      // hue-independent move the current-hour ring itself
                      // made, and it stays clear of --accent, which this
                      // card's own colour comment above reserves for actual
                      // click targets like "Odśwież", not a read-only reading.
                      isSelected
                        ? 'ring-2 ring-inset ring-text'
                        : slot.hour === currentHour
                          ? 'ring-1 ring-inset ring-text-secondary'
                          : 'opacity-60'
                    }`}
                  />
                )}
              </div>
            );
          })}
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
