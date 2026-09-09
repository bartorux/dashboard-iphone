import React from 'react';
import { formatMW } from '../../utils/format';

/**
 * Pieces every chart view shares. Kept together so the three views cannot drift
 * apart in spacing, number formatting or empty-state wording.
 */

/**
 * Re-exported rather than imported directly by the three chart views below:
 * their own `import { formatMW } from './shared'` stays exactly as it was, so
 * moving the one true implementation to utils/format.ts (shared with
 * AlertsPanel, CurrentStatusCard and TrendsSection) touches no import lines
 * in this file's own consumers.
 */
export { formatMW };

/** Curves redraw rather than jump when the selected day changes. */
export const ANIMATION_MS = 450;

/**
 * Chart animation length, nil for a reader who asked for less motion.
 *
 * The CSS block for `prefers-reduced-motion` cannot reach this. Recharts takes
 * its duration as a React prop and animates in JavaScript, so a rule setting
 * `animation-duration` to nothing sails past it — and someone who turned motion
 * down in their system settings still got the full 450 ms on every chart, on
 * every day switch, forever. That is the setting failing silently, which is
 * worse than not offering it.
 *
 * Subscribed rather than read once: the setting can change while the app is
 * open, and on iOS it does — Low Power Mode and the accessibility toggle both
 * move it.
 */
export function useChartAnimationMs(): number {
  const [reduced, setReduced] = React.useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );

  React.useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;

    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced ? 0 : ANIMATION_MS;
}

/**
 * Whether THIS render should animate: true only when `data` — the day's rows —
 * is a different object than last time. A chart that also takes layers which
 * arrive later (curtailment, country demand) re-renders when they land, and
 * Recharts would then restart the 450 ms draw from wherever the first one had
 * got to. The reader saw that as the generation view "jerking" on every day
 * switch while the reserve view, which has no late layer, stayed smooth.
 * The late layer snaps in; only a new day gets the draw.
 */
export function useAnimateOnDataChange(data: unknown): boolean {
  const previous = React.useRef<unknown>(undefined);
  const changed = previous.current !== data;
  React.useEffect(() => {
    previous.current = data;
  });
  return changed;
}

/**
 * Axis and label sizes for the charts, in the same scalable units as the rest
 * of the app.
 *
 * Recharts takes these as props rather than CSS, so a number here would stay a
 * fixed pixel count while everything around it grew — someone who had enlarged
 * their text got roomier cards above a chart whose axis stayed just as small as
 * before, which is the one part of the screen holding the numbers.
 */
export const AXIS_FONT_SIZE = '0.6875rem';
export const LABEL_FONT_SIZE = '0.625rem';

/** top leaves room for the "teraz" label, which sits above the plot area. */
export const CHART_MARGIN = { top: 18, right: 10, bottom: 4, left: 0 };

/**
 * Root font size in pixels, or 16 where there is no document to ask.
 *
 * Everything else scales through rem, but Recharts wants the axis width as a
 * number, so this is the one place that has to know what a rem is worth.
 */
function rootFontPx(): number {
  if (typeof window === 'undefined') return 16;
  const size = parseFloat(
    window.getComputedStyle(document.documentElement).fontSize
  );
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * Longest tick label PSE data actually produces: "-1 000" and "25 000" both
 * run 6 characters (the minus sign costs as much room as a digit); a
 * seven-character reading does not occur in the feed.
 *
 * Used to be `Math.max(...ticks.map((t) => formatMW(t).length))` instead — the
 * width of THIS day's widest label. That made the Y axis, and with it the
 * whole plot area, shift day to day (51px at an 8 000 MW peak, 57px at
 * 10 000 or at a negative value) and disagree between the three chart views
 * looking at different data on the same day. The alert panel's day-axis track
 * (see `dayAxisInset` below) has to land its own left edge at the same x as
 * this one, which only holds if the axis width is a constant rather than a
 * function of whatever numbers happen to be on screen.
 */
const MAX_TICK_LABEL_LENGTH = 6;

/**
 * Y axis width, fixed rather than measured from the ticks on screen — see
 * `MAX_TICK_LABEL_LENGTH` for why a per-render measurement was the bug, not
 * the feature.
 *
 * Scaled by the root size, because the tick font is in rem: a width fixed for
 * an 11px label clipped the axis outright once the reader enlarged their
 * text — the chart grew, the room for its numbers did not.
 */
export function axisWidthFor(): number {
  const scale = rootFontPx() / 16;
  // ~6.5px per character at the default size, plus tick margin and breathing room
  return Math.ceil(MAX_TICK_LABEL_LENGTH * 6.5 * scale) + Math.ceil(18 * scale);
}

/**
 * Card padding the day axis has to reach through, kept as constants rather
 * than read off the DOM: `dayAxisInset` runs before layout (it sizes a track
 * that hasn't painted yet), so the two numbers it depends on have to be
 * known ahead of time. They live here, next to the function that is their
 * only reader, instead of in ChartSection.tsx and AlertsPanel.tsx — a
 * constant sitting in the component it describes looks like it only has to
 * agree with itself, when its actual job is to agree with a number in an
 * unrelated file two DOM trees away. One file that has to know both wrong
 * numbers at once is easier to catch drifting than two files that each look
 * locally correct.
 */
const CHART_CARD_PADDING_PX = 12; // p-3 on the chart card (ChartSection.tsx, ~line 139)
/** p-4 on the alerts card (AlertsPanel.tsx) — exported so that file can
 *  subtract its own padding back out without hardcoding the number. */
export const ALERTS_CARD_PADDING_PX = 16;

/**
 * Where the day axis starts and ends, measured from the OUTER edge of
 * whichever card draws it.
 *
 * This is the single fact both the reserve chart's plot area and the alert
 * panel's day-axis track have to agree with: the chart's Y axis sits `left`
 * pixels in from its card's outer edge, and its plot area ends `right`
 * pixels short of the card's outer edge on the right. A caller that wants a
 * track lined up with that axis subtracts its OWN card's padding back out —
 * see AlertsPanel.tsx — rather than this function trying to guess which
 * card is asking.
 */
export function dayAxisInset(): { left: number; right: number } {
  return {
    left: CHART_CARD_PADDING_PX + axisWidthFor(),
    right: CHART_CARD_PADDING_PX + CHART_MARGIN.right,
  };
}

/**
 * Every fourth hour, and nothing else.
 *
 * The final hour used to be appended whatever the rhythm, so a full day read
 * 00 04 08 12 16 20 23 — five gaps of four and then one of three. It was there
 * to show where the day ends, but the axis already runs that far; all the label
 * added was a stutter at the one end of the scale the eye travels to last.
 */
export function hourTicks(keys: string[]): string[] {
  return keys.filter((_, index) => index % 4 === 0);
}

/** "19:00" -> "19" */
export const shortHour = (value: string) => value.slice(0, -3);

/**
 * Appends a 25th row keyed "24:00" so a day of 24 hourly rows produces 24
 * gaps across the plot instead of 23.
 *
 * Recharts places the first category at the plot's left edge and the last
 * at its right edge, spreading the (n - 1) gaps between them evenly. With
 * the raw 24 hours ("00:00".."23:00") that puts hour h at h/23 of the
 * width, not h/24 — the chart was quietly saying the day ends at 23:00.
 * Measured on the deployed app: 12.087px per hour on the chart against
 * 11.583px on the alert panel's day-axis track, a gap that grew with the
 * hour and peaked at 9.6px around 19:00, exactly where the alerts sit. A
 * 25th, closing category fixes the arithmetic without changing what is
 * plotted: hour h then lands at h/24 of the width, matching the day-axis
 * track, which divides its own width by 24 because it has to fit the
 * 23:00-24:00 hour completely rather than stopping at its start.
 *
 * The closing row copies every field from the real 23:00 row, because that
 * row IS the 23:00-24:00 reading: a curve that stopped at the 23:00 point
 * broke off 12px before the edge instead of running that last hour's block
 * out to where it actually ends. `overrides` lets a caller blank out fields
 * that mark a single, discrete hour — an alert dot, say — so the copy does
 * not repaint that mark a second time at the new edge; continuous fields
 * (the lines, bands and fills the reader is meant to see reach the edge)
 * are left alone.
 *
 * Only ever feeds the plot's `data` prop. Everything else that reads a
 * day's rows — the hour table, tooltips' own row list, the Y-axis scale,
 * curtailment counts — keeps using the 24-row list this returns 25 from,
 * so the synthetic hour cannot leak into a place that states it as real.
 *
 * An empty day (no rows at all) has no 23:00 row to extend, so it stays
 * empty rather than manufacturing one from nothing.
 */
export function withDayEnd<T extends { key: string }>(
  rows: readonly T[],
  overrides: Partial<T> = {}
): T[] {
  if (rows.length === 0) return [];
  const last = rows[rows.length - 1];
  return [...rows, { ...last, ...overrides, key: '24:00' } as T];
}

/**
 * The hour a tooltip should announce for a hovered row.
 *
 * The closing "24:00" row from `withDayEnd` exists only to give a chart a
 * right edge to draw to — it is not a real hour. Left alone, hovering the
 * sliver of plot between the real 23:00 point and that edge would open a
 * tooltip captioned "24:00", a fourth hour nobody's data ever had. This
 * reports it as 23:00 instead: the same block the real 23:00 row already
 * describes, described the same way, so the two are indistinguishable to
 * whoever is scrubbing across them.
 */
export function tooltipHourKey(rowKey: string): string {
  return rowKey === '24:00' ? '23:00' : rowKey;
}

/**
 * Chart height.
 *
 * The ceiling has to rise with the width or the curve flattens into a strip:
 * left at 22rem, a chart given a 24-inch monitor is nearly four times as wide as
 * it is tall, and the shape of the evening — the thing being read — disappears
 * into a horizontal smear. The phone keeps 45vh capped at 22rem exactly as
 * before; both larger sizes only ever apply above a breakpoint it cannot reach.
 */
/*
 * Height lives in the .chart-box-h class (App.css), not in this Tailwind
 * chain, so it can be expressed in dvh as well as vh — see that rule's own
 * comment for why: vh on iOS Safari holds the address bar's height even after
 * it collapses on scroll, so the chart visibly grew every time the bar hid.
 */
export const CHART_BOX =
  'chart-box-h max-h-[22rem] min-h-[15rem] w-full md:max-h-[26rem] xl:max-h-[36rem]';

export interface LegendItem {
  label: string;
  swatch: React.ReactNode;
  /**
   * Shown only after the reader asks for it. A permanent paragraph above the
   * chart pushed the chart itself off the first screen.
   *
   * An array becomes separate paragraphs. One entry needed to explain what a
   * view is FOR and how to read it, not merely what a colour means, and three
   * short blocks carry that where one long sentence did not.
   */
  info?: string | string[];
}

export const ChartLegend: React.FC<{
  items: LegendItem[];
  /**
   * Tightens the gaps and the info button for a legend that has more entries
   * than a phone row can hold.
   *
   * Opt-in rather than the default on purpose: every pixel taken out here is a
   * pixel of separation between two keys, so it is worth spending only where
   * the alternative is an extra wrapped row — and a wrapped row costs 20px of
   * the chart itself. A view that already fits keeps the roomier spacing.
   */
  dense?: boolean;
}> = ({ items, dense }) => {
  const [openLabel, setOpenLabel] = React.useState<string | null>(null);
  const open = items.find((item) => item.label === openLabel);

  return (
    <>
      <ul
        className={`flex flex-wrap items-center gap-y-1 text-[0.6875rem] text-text-secondary ${
          dense ? 'gap-x-2' : 'gap-x-3'
        }`}
      >
        {items.map((item) => (
          <li
            key={item.label}
            className={`flex items-center ${dense ? 'gap-1' : 'gap-1.5'}`}
          >
            {item.swatch}
            {item.label}
            {item.info && (
              <button
                type="button"
                aria-label={`Co oznacza: ${item.label}`}
                aria-expanded={openLabel === item.label}
                onClick={() =>
                  setOpenLabel((current) =>
                    current === item.label ? null : item.label
                  )
                }
                className={`grid place-items-center rounded-full bg-surface-3 text-[0.5625rem] font-semibold text-text-secondary ${
                  dense ? 'h-3.5 w-3.5' : 'h-4 w-4'
                }`}
              >
                ?
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Same mechanism as SummaryCard's body (see .collapsible in App.css):
          always mounted, so grid-template-rows has something to animate
          between 0fr and 1fr. A bare `{open?.info && ...}` unmounts the panel
          outright on close, which leaves nothing for a transition to play -
          it is just gone, the same jump-cut every other collapsing section in
          this app has already moved away from. */}
      <div className="collapsible" data-collapsed={!open?.info}>
        <div>
          {open?.info && (
            <div className="mt-1.5 space-y-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[0.6875rem] leading-relaxed text-text-secondary">
              {(Array.isArray(open.info) ? open.info : [open.info]).map((part) => (
                <p key={part}>{part}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

/**
 * A key for one line series. The stroke pattern is part of the identity, not
 * decoration: where two lines cross repeatedly, a reader tells them apart by
 * the character of the stroke long before they look up a colour. So the swatch
 * has to carry the same pattern the chart draws — solid, dashed or dotted.
 */
export const LineSwatch: React.FC<{
  color: string;
  dashed?: boolean;
  dotted?: boolean;
}> = ({ color, dashed, dotted }) =>
  dashed || dotted ? (
    <span
      className={`h-0 w-4 border-t-2 ${dotted ? 'border-dotted' : 'border-dashed'}`}
      style={{ borderColor: color }}
    />
  ) : (
    <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
  );

export const AreaSwatch: React.FC<{ fill: string; border: string }> = ({
  fill,
  border,
}) => (
  <span
    className="h-2.5 w-2.5 rounded-[3px] border"
    style={{ background: fill, borderColor: border }}
  />
);

export const ChartTooltipBox: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="min-w-[10rem] rounded-xl bg-surface px-3 py-2 text-[0.75rem] shadow-lg ring-1 ring-separator">
    {children}
  </div>
);

export const TooltipRow: React.FC<{
  label: string;
  value: string;
  tone?: string;
  divider?: boolean;
  /** Marks the row as a component of the one above it. */
  indent?: boolean;
}> = ({ label, value, tone = 'text-text', divider, indent }) => (
  <div
    className={`flex justify-between gap-4 ${
      divider ? 'mt-1 border-t border-separator pt-1' : ''
    }`}
  >
    {/* Leading spaces would collapse in HTML, so the indent has to be styled */}
    <dt className={`text-text-secondary ${indent ? 'pl-3' : ''}`}>{label}</dt>
    <dd className={`tnum font-medium ${tone}`}>{value}</dd>
  </div>
);

/** Movement above this counts as scrubbing rather than a tap. */
const TAP_SLOP_PX = 8;

/**
 * Makes the tooltip dismissible on touch.
 *
 * Recharts opens its tooltip on touch and then leaves it there — on a phone
 * there is no pointer to move away, so it never closes. A second tap toggles it
 * shut, and so does a touch anywhere outside the chart. Dragging across the
 * chart keeps it open, since that is the gesture used to read values.
 *
 * Mouse hover is left untouched: the gate only engages once the chart has
 * actually been touched.
 */
export function useDismissibleTooltip() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [touchUsed, setTouchUsed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const startRef = React.useRef({ x: 0, y: 0 });
  const movedRef = React.useRef(false);

  React.useEffect(() => {
    const onDocumentTouch = (event: TouchEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('touchstart', onDocumentTouch, { passive: true });
    return () => document.removeEventListener('touchstart', onDocumentTouch);
  }, []);

  const handlers = {
    onTouchStart: (event: React.TouchEvent) => {
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
      movedRef.current = false;
      setTouchUsed(true);
    },
    onTouchMove: (event: React.TouchEvent) => {
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - startRef.current.x);
      const dy = Math.abs(touch.clientY - startRef.current.y);
      if (dx > TAP_SLOP_PX || dy > TAP_SLOP_PX) {
        movedRef.current = true;
        setOpen(true);
      }
    },
    onTouchEnd: () => {
      if (!movedRef.current) setOpen((value) => !value);
    },
  };

  return {
    ref,
    handlers,
    // undefined = let Recharts decide, which is what a mouse should get;
    // once touched, the tooltip is ours to open and close.
    tooltipActive: touchUsed ? open : undefined,
  };
}
