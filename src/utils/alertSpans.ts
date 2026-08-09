import { AlertRange } from '../types';

export interface AlertSpan {
  key: string;
  /** Category the shading starts at. */
  from: string;
  /** Category it ends at — always at or after `from` in axis order. */
  to: string;
  severity: 'red' | 'orange';
}

/**
 * Turns merged alert ranges into spans expressed in categories of the reserve
 * chart's X axis, which is the list of hour labels being plotted.
 *
 * `AlertRange.to` is the block's *end* label. For every block but the last that
 * is also the next block's start, and so a category in its own right. The final
 * block of the day ends at "00:00", which is the axis's *first* category —
 * shading to it would wrap the whole chart backwards, so that case is clamped to
 * the last hour drawn.
 *
 * Ranges whose start is not on this axis are dropped rather than guessed at:
 * they belong to a different day.
 */
export function alertSpans(
  hourLabels: string[],
  ranges: AlertRange[]
): AlertSpan[] {
  if (hourLabels.length === 0) return [];

  const position = new Map(hourLabels.map((label, index) => [label, index]));
  const lastLabel = hourLabels[hourLabels.length - 1];

  return ranges.flatMap((range) => {
    const start = position.get(range.from);
    if (start === undefined) return [];

    const end = position.get(range.to);
    // Unknown, or wrapping back to an earlier category — both mean the range
    // runs to the end of what is plotted.
    const to = end === undefined || end <= start ? lastLabel : range.to;

    return [
      {
        key: `${range.severity}-${range.from}`,
        from: range.from,
        to,
        severity: range.severity,
      },
    ];
  });
}
