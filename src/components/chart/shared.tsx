import React from 'react';

/**
 * Pieces every chart view shares. Kept together so the three views cannot drift
 * apart in spacing, number formatting or empty-state wording.
 */

export const formatMW = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

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
 * Y axis width has to follow the widest tick label; a value sized for four
 * digits clips the fifth once a series passes 10 000 MW.
 *
 * Scaled by the root size, because the tick font is now in rem: a width fixed
 * for an 11px label clipped the axis outright once the reader enlarged their
 * text — the chart grew, the room for its numbers did not.
 */
export function axisWidthFor(ticks: number[]): number {
  const longest = Math.max(...ticks.map((tick) => formatMW(tick).length));
  const scale = rootFontPx() / 16;
  // ~6.5px per digit at the default size, plus tick margin and breathing room
  return Math.ceil(longest * 6.5 * scale) + Math.ceil(18 * scale);
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
 * Chart height.
 *
 * The ceiling has to rise with the width or the curve flattens into a strip:
 * left at 22rem, a chart given a 24-inch monitor is nearly four times as wide as
 * it is tall, and the shape of the evening — the thing being read — disappears
 * into a horizontal smear. The phone keeps 45vh capped at 22rem exactly as
 * before; both larger sizes only ever apply above a breakpoint it cannot reach.
 */
export const CHART_BOX =
  'h-[45vh] max-h-[22rem] min-h-[15rem] w-full md:max-h-[26rem] xl:h-[52vh] xl:max-h-[36rem]';

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
