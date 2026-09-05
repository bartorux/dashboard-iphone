import React from 'react';
import { CompassRange, COMPASS_WORD } from '../../utils/compass';
import { CHART_MARGIN } from './shared';

interface CompassLaneProps {
  ranges: CompassRange[];
  /** The chart's X categories, in order — the same array the plot is built from. */
  hourKeys: string[];
  /** Width Recharts reserved for the Y axis, so the lane starts where the plot does. */
  axisWidth: number;
}

/**
 * The operator's request, laid out under the plot on the plot's own time axis.
 *
 * This is the only place the two signals can be compared. The alerts card says
 * "the operator asks for saving between 19:00 and 21:00" and "the margin is
 * tightest at 20:00" as two separate sentences; here the reader sees whether
 * those two things are the same hours or not, which is the one thing the card
 * cannot show.
 *
 * It is a grid of divs rather than a Recharts series on purpose: a series would
 * have to live inside the plot area, and the whole point is that Kompas is NOT
 * a quantity on this Y scale — it is a different axis of meaning that happens
 * to share the day. Above the axis, megawatts; below it, what is being asked.
 *
 * Alignment is arithmetic, not eyeballed. The X axis is categorical with
 * `interval={0}` and no padding, so category *i* sits at (i + 0.5) · bandWidth
 * of the plot area — and a `repeat(n, 1fr)` cell has its centre in exactly the
 * same place, provided the lane starts after the axis labels and stops where
 * the plot's right margin does. Hence the two paddings below; they are the
 * whole mechanism.
 */
const CompassLane: React.FC<CompassLaneProps> = ({ ranges, hourKeys, axisWidth }) => {
  // No flag is the state of almost every hour of almost every day. An empty
  // lane would be a permanent piece of furniture announcing nothing, and the
  // reflex we want is "the lane appeared, so something is being asked".
  if (ranges.length === 0 || hourKeys.length === 0) return null;

  /*
   * Walked from `from` for `hours` blocks rather than from `from` to `to`:
   * `to` is the label AFTER the last flagged hour (see compassRanges), so
   * matching on it would paint one block too many at the end of every range.
   */
  const levelByHour = new Map<string, 2 | 3>();
  for (const range of ranges) {
    const start = hourKeys.indexOf(range.from);
    if (start < 0) continue;
    for (let step = 0; step < range.hours; step++) {
      const key = hourKeys[start + step];
      if (key !== undefined) levelByHour.set(key, range.level);
    }
  }

  if (levelByHour.size === 0) return null;

  return (
    <div
      data-testid="compass-lane"
      /*
       * aria-hidden, and deliberately so: every hour drawn here is already
       * written out in words in the alerts card, with the level named. A
       * screen reader gaining a second, wordless copy of the same fact would
       * be noise, not access.
       */
      aria-hidden="true"
      className="mt-1 flex"
      style={{ paddingLeft: axisWidth, paddingRight: CHART_MARGIN.right }}
    >
      <div
        className="grid h-2.5 w-full gap-px"
        style={{ gridTemplateColumns: `repeat(${hourKeys.length}, 1fr)` }}
      >
        {hourKeys.map((key) => {
          const level = levelByHour.get(key);
          if (level === undefined) return <div key={key} />;
          /*
           * Texture carries the level, colour only carries "this is Kompas".
           * Level 3 is solid, level 2 is hatched — so the difference survives
           * greyscale print and full colour blindness, which a magenta-only
           * encoding would not.
           */
          const style =
            level === 3
              ? { background: 'var(--compass)' }
              : {
                  backgroundImage:
                    'repeating-linear-gradient(45deg, var(--compass) 0 2px, transparent 2px 4px)',
                };
          return <div key={key} className="rounded-sm" style={style} title={COMPASS_WORD[level]} />;
        })}
      </div>
    </div>
  );
};

export default CompassLane;
