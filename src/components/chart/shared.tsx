import React from 'react';

/**
 * Pieces every chart view shares. Kept together so the three views cannot drift
 * apart in spacing, number formatting or empty-state wording.
 */

export const formatMW = (value: number) =>
  new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);

/** Curves redraw rather than jump when the selected day changes. */
export const ANIMATION_MS = 450;

/** top leaves room for the "teraz" label, which sits above the plot area. */
export const CHART_MARGIN = { top: 18, right: 10, bottom: 4, left: 0 };

/**
 * Y axis width has to follow the widest tick label; a value sized for four
 * digits clips the fifth once a series passes 10 000 MW.
 */
export function axisWidthFor(ticks: number[]): number {
  const longest = Math.max(...ticks.map((tick) => formatMW(tick).length));
  // ~6.1px per digit at 11px, plus tick margin and a little breathing room
  return Math.ceil(longest * 6.5) + 18;
}

/** Every fourth hour, always including the last, so the day reads 00 -> 23. */
export function hourTicks(keys: string[]): string[] {
  const ticks = keys.filter((_, index) => index % 4 === 0);
  const last = keys[keys.length - 1];
  if (last && !ticks.includes(last)) ticks.push(last);
  return ticks;
}

/** "19:00" -> "19" */
export const shortHour = (value: string) => value.slice(0, -3);

export const CHART_BOX = 'h-[45vh] max-h-[22rem] min-h-[15rem] w-full';

export interface LegendItem {
  label: string;
  swatch: React.ReactNode;
  /**
   * Shown only after the reader asks for it. A permanent paragraph above the
   * chart pushed the chart itself off the first screen.
   */
  info?: string;
}

export const ChartLegend: React.FC<{ items: LegendItem[] }> = ({ items }) => {
  const [openLabel, setOpenLabel] = React.useState<string | null>(null);
  const open = items.find((item) => item.label === openLabel);

  return (
    <>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
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
                className="grid h-4 w-4 place-items-center rounded-full bg-surface-3 text-[9px] font-semibold text-text-secondary"
              >
                ?
              </button>
            )}
          </li>
        ))}
      </ul>

      {open?.info && (
        <p className="mt-1.5 rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-text-secondary">
          {open.info}
        </p>
      )}
    </>
  );
};

export const LineSwatch: React.FC<{ color: string; dashed?: boolean }> = ({
  color,
  dashed,
}) =>
  dashed ? (
    <span
      className="h-0 w-4 border-t-2 border-dashed"
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
  <div className="min-w-[10rem] rounded-xl bg-surface px-3 py-2 text-[12px] shadow-lg ring-1 ring-separator">
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
