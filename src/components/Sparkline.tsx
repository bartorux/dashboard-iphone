import React from 'react';

interface SparklineProps {
  /** One entry per hour, in order. `null` is a gap and stays a gap. */
  values: (number | null)[];
  /** Index the dot sits on, or null for a trace with no dot. */
  dotIndex?: number | null;
  /**
   * Colour class for the dot — the tile's own status token, e.g. `text-ok-text`.
   * Applied to the <svg>, and the dot paints with `currentColor`; the trace
   * overrides it with its own de-emphasis stroke.
   */
  toneClassName?: string;
  /** Height utilities, e.g. `h-4 xl:h-5`. Width is always the container's. */
  className?: string;
}

/** Half the stroke plus the dot's radius, so neither is clipped at the edge. */
const PAD = 2.75;
const DOT_R = 2;

export interface SparklineGeometry {
  /** SVG path `d` attribute — possibly several subpaths, one per gap-free run. */
  d: string;
  /** Centre of the dot, or null when there is nothing to mark. */
  dot: { x: number; y: number } | null;
}

/**
 * The pure geometry behind the trace, pulled out of the component so it has a
 * test independent of ResizeObserver — jsdom's stub (see src/test/setup.ts)
 * never fires the callback that would otherwise be the only way to give this
 * logic a non-zero width in a test.
 */
export function buildSparklinePath(
  values: (number | null)[],
  dotIndex: number | null,
  width: number,
  height: number
): SparklineGeometry | null {
  if (width <= 0 || height <= 0 || values.length < 2) return null;

  const numbers = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (numbers.length < 2) return null;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  // A flat day would divide by zero; drawn down the middle instead.
  const span = max - min || 1;
  const innerW = Math.max(width - PAD * 2, 1);
  const innerH = Math.max(height - PAD * 2, 1);

  const point = (index: number, value: number) => ({
    x: PAD + (innerW * index) / (values.length - 1),
    y: PAD + innerH - ((value - min) / span) * innerH,
  });

  /*
   * A missing hour breaks the path (`M` starts a new subpath) rather than
   * being bridged. An interpolated segment would draw a reading PSE never
   * published, in the same de-emphasis grey as the readings it did — the one
   * thing a mark this small must never do, because there is no legend, no
   * tooltip and no axis here to correct the impression.
   */
  let d = '';
  let penDown = false;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || !Number.isFinite(value)) {
      penDown = false;
      continue;
    }
    const { x, y } = point(i, value);
    d += `${penDown ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
    penDown = true;
  }

  const dotValue =
    dotIndex !== null && dotIndex >= 0 && dotIndex < values.length
      ? values[dotIndex]
      : null;
  const dot =
    dotValue !== null && Number.isFinite(dotValue) ? point(dotIndex!, dotValue) : null;

  return { d: d.trim(), dot };
}

/**
 * A 24-hour trace, drawn as plain SVG.
 *
 * Not Recharts. A 150x16 tile does not need a cartesian engine, an axis system,
 * a tooltip layer or a 450ms animation — it needs one path. Recharts in a
 * sparkline would also drag its own responsive container into four tiles and a
 * card, five more resize observers on a phone, for a mark with no interaction
 * of any kind.
 *
 * It is a supporting mark, not a chart: no axis, no labels, no hover, no
 * animation, and `aria-hidden`. The figure beside it is the reading; this only
 * says what shape the day had. Every number it is drawn from is already in the
 * hour table under the chart, so nothing is gated behind it.
 *
 * The trace takes --text-tertiary rather than a series colour. It is not a new
 * series: adopting the reserve blue would make five little charts claim to be
 * the same series as the main plot at a different scale, and adopting a status
 * colour would make the SHAPE look like a judgement. The de-emphasis hue plus a
 * single tinted dot is the stat-tile contract from marks-and-anatomy — the
 * trend recessive, the point of interest in the accent.
 *
 * Round cap and join at 1.5px, which is the one place in this app where the cap
 * is a spec rather than a default: at this size a butt cap on a steep segment
 * reads as a broken pixel, and the dot has to sit flush into the line it ends.
 *
 * Sized from the measured box rather than a viewBox, so the geometry is in real
 * pixels: `preserveAspectRatio="none"` would stretch the coordinate system and
 * with it the stroke width, the round cap and the dot — an ellipse where a
 * circle was asked for. Before the first measurement it renders an empty box of
 * the right height, so nothing reflows when the width arrives.
 */
const Sparkline: React.FC<SparklineProps> = ({
  values,
  dotIndex = null,
  toneClassName = 'text-text-tertiary',
  className = '',
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const geometry = React.useMemo(
    () => buildSparklinePath(values, dotIndex, width, height),
    [values, dotIndex, width, height]
  );

  return (
    <div ref={ref} aria-hidden className={`w-full ${className}`}>
      {geometry && (
        <svg
          width={width}
          height={height}
          className={`block ${toneClassName}`}
          role="presentation"
        >
          <path
            d={geometry.d}
            fill="none"
            className="stroke-text-tertiary"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {geometry.dot && (
            <circle cx={geometry.dot.x} cy={geometry.dot.y} r={DOT_R} fill="currentColor" />
          )}
        </svg>
      )}
    </div>
  );
};

export default Sparkline;
