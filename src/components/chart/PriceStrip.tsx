import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { PriceDay } from '../../utils/cenyTypes';
import { niceScaleRange } from '../../utils/scale';
import { useChartColors } from '../../hooks/useChartColors';
import {
  useChartAnimationMs,
  AXIS_FONT_SIZE,
  CHART_MARGIN,
  ChartTooltipBox,
  TooltipRow,
  axisWidthFor,
  hourTicks,
  shortHour,
  tooltipHourKey,
  useDismissibleTooltip,
  withDayEnd,
} from './shared';

interface PriceStripProps {
  day: PriceDay;
}

interface Row {
  /** Hour the block starts, e.g. "19:00" — also the X category, exactly like
   *  ReserveChart's Row.key, so `hourTicks`/`shortHour`/`tooltipHourKey` work
   *  unchanged and the two charts' hour grids line up. */
  key: string;
  endLabel: string;
  /** Confirmed price — drawn as the line. Always null on a forecast day: see
   *  the module comment on why the model's own central estimate never
   *  reaches the plot, only the tooltip contract in cenyTypes.ts is silent
   *  about a plotted line, and this file draws none. */
  price: number | null;
  /** [p10, p90] — the only thing a forecast day draws. Recharts renders a
   *  two-element array value as a filled range, the same trick ReserveChart
   *  uses for its alarm/warn zones (`zoneAlarm`/`zoneWarn`). */
  band: [number, number] | null;
  /** Band edges, stroked separately so the boundary reads as a crisp line
   *  over the fill — same split as ReserveChart's alarmTop/warnTop. */
  bandTop: number | null;
  bandBottom: number | null;
}

const PRICE_FMT = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const formatPrice = (v: number) => PRICE_FMT.format(v);

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'wysoka',
  medium: 'średnia',
  low: 'niska',
};

/** Fixed rather than responsive to content: a strip this short exists to be
 *  glanced at under the reserve chart, not read on its own. */
const STRIP_HEIGHT = 76;

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  confirmed: boolean;
}

/** Exported for the same reason ReserveTooltip is: hover-only UI needs a
 *  direct assertion, since a chart-level test can never see what only
 *  appears on pointer-over. */
export const PriceTooltip: React.FC<TooltipProps> = ({ active, payload, confirmed }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const hourKey = tooltipHourKey(row.key);

  if (confirmed) {
    if (row.price === null) {
      return (
        <ChartTooltipBox>
          <div className="font-semibold text-text">{hourKey}</div>
          <div className="text-text-tertiary">Brak danych</div>
        </ChartTooltipBox>
      );
    }
    return (
      <ChartTooltipBox>
        <div className="mb-1 font-semibold text-text">
          {hourKey}&ndash;{row.endLabel}
        </div>
        <TooltipRow label="Cena" value={`${formatPrice(row.price)} zł/MWh`} />
      </ChartTooltipBox>
    );
  }

  if (row.band === null) {
    return (
      <ChartTooltipBox>
        <div className="font-semibold text-text">{hourKey}</div>
        <div className="text-text-tertiary">Brak prognozy</div>
      </ChartTooltipBox>
    );
  }

  const [p10, p90] = row.band;
  return (
    <ChartTooltipBox>
      <div className="mb-1 font-semibold text-text">
        {hourKey}&ndash;{row.endLabel}
      </div>
      {/* No central estimate here, on purpose — see the module comment: the
          owner's "T2" choice keeps the forecast a range everywhere it
          appears, tooltip included, not only in the plotted band. */}
      <TooltipRow label="Prognoza" value={`${formatPrice(p10)}–${formatPrice(p90)} zł/MWh`} />
    </ChartTooltipBox>
  );
};

/**
 * Day-ahead electricity price, under the reserve chart, in the "Rezerwa" view
 * only (ChartSection decides that; this component only draws what it is
 * given).
 *
 * A confirmed day (TGE fixing already cleared) draws one line, the same
 * visual grammar as every other certain series on this page. A forecast day
 * draws only its 10-90% band — no central line, dashed or otherwise. That
 * split is the owner's one hard requirement for this feature: a prediction
 * must never look like a certainty, so the two states use genuinely
 * different marks rather than the same mark in a fainter tint. `source` on
 * the data decides which branch runs; nothing here infers it from whether a
 * band happens to be present, matching the contract in cenyTypes.ts.
 *
 * The X axis reuses `axisWidthFor()`, `CHART_MARGIN` and `withDayEnd` from
 * ReserveChart's own toolkit unchanged, rather than recomputing anything
 * that looks equivalent: that is the entire mechanism pinning an hour to the
 * same pixel column in both charts (measured and fixed once already, see
 * `dayAxisInset`'s own comment for the class of bug a second, "close enough"
 * computation caused here before).
 */
const PriceStrip: React.FC<PriceStripProps> = ({ day }) => {
  const animationMs = useChartAnimationMs();
  const colors = useChartColors();
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();

  const confirmed = day.source === 'confirmed';

  const rows = useMemo<Row[]>(
    () =>
      day.hours.map((hour) => {
        const pad = (h: number) => String(h).padStart(2, '0');
        const key = `${pad(hour.hour)}:00`;
        const endLabel = `${pad((hour.hour + 1) % 24)}:00`;

        if (confirmed) {
          return { key, endLabel, price: hour.price, band: null, bandTop: null, bandBottom: null };
        }

        const hasBand = hour.p10 !== null && hour.p90 !== null;
        return {
          key,
          endLabel,
          price: null,
          band: hasBand ? [hour.p10 as number, hour.p90 as number] : null,
          bandTop: hasBand ? hour.p90 : null,
          bandBottom: hasBand ? hour.p10 : null,
        };
      }),
    [day, confirmed]
  );

  const ticks = useMemo(() => hourTicks(rows.map((row) => row.key)), [rows]);

  // Same closing-row trick as ReserveChart's chartRows — see withDayEnd.
  const chartRows = useMemo(() => withDayEnd(rows), [rows]);

  const scale = useMemo(() => {
    const values = confirmed
      ? rows.map((row) => row.price)
      : rows.flatMap((row) => [row.bandTop, row.bandBottom]);
    const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
    return valid.length > 0
      ? niceScaleRange(Math.min(...valid), Math.max(...valid))
      : niceScaleRange(0, 1000);
  }, [rows, confirmed]);

  const chipClass = confirmed
    ? 'bg-ok-soft text-ok-text'
    : 'bg-surface-2 text-text-secondary';
  const chipText = confirmed
    ? 'potwierdzona · TGE'
    : `prognoza ${day.horizon ?? ''} · pewność ${
        day.confidence ? CONFIDENCE_LABEL[day.confidence] : '—'
      }`;

  /*
   * A 23- or 25-hour day (the two DST changeovers a year) does not fit this
   * axis: `withDayEnd`, `hourTicks` and the shared x-scale all assume a plain
   * 24-hour grid, in lockstep with ReserveChart above. Stretching or
   * truncating the day to force it onto that grid would draw an hour at the
   * wrong x — silently, since nothing about a misplaced tick throws. A
   * missing strip on the two days a year this happens is the smaller error.
   * Deliberately checked after every hook above, so the hook order never
   * depends on the data — only what gets returned does.
   */
  if (day.hours.length !== 24) return null;

  return (
    <figure className="m-0 mt-2">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <span className="text-[0.8125rem] font-semibold text-text">Cena energii</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${chipClass}`}
        >
          {chipText}
        </span>
      </div>

      <div className="relative mt-1" ref={ref} {...handlers}>
        {/* Unit above the field, not on it — same spot the reference mock
            (propozycje-ceny.html's `axes()`) places it, left-aligned with
            where the Y-axis tick labels start. */}
        <span
          className="pointer-events-none absolute text-[0.625rem]"
          style={{ left: axisWidthFor(), top: 0, color: colors.axis }}
        >
          zł/MWh
        </span>

        <ResponsiveContainer width="100%" height={STRIP_HEIGHT}>
          <ComposedChart data={chartRows} margin={CHART_MARGIN}>
            <CartesianGrid vertical={false} stroke={colors.grid} />

            <XAxis
              dataKey="key"
              ticks={ticks}
              interval={0}
              tickFormatter={shortHour}
              tick={{ fontSize: AXIS_FONT_SIZE, fill: colors.axis }}
              tickLine={false}
              axisLine={{ stroke: colors.grid }}
              tickMargin={8}
            />

            <YAxis
              domain={[scale.min, scale.max]}
              ticks={scale.ticks}
              tick={{ fontSize: AXIS_FONT_SIZE, fill: colors.axis }}
              tickFormatter={formatPrice}
              tickLine={false}
              axisLine={false}
              width={axisWidthFor()}
            />

            <Tooltip
              active={tooltipActive}
              content={<PriceTooltip confirmed={confirmed} />}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {confirmed ? (
              <Line
                type="monotone"
                dataKey="price"
                stroke={colors.price}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                animationDuration={animationMs}
                activeDot={
                  tooltipActive === false
                    ? false
                    : { r: 4, fill: colors.price, stroke: colors.surface, strokeWidth: 2 }
                }
              />
            ) : (
              <>
                {/* Fill first, edges drawn over it — same order as
                    ReserveChart's bands, so the boundary stays crisp instead
                    of disappearing under the fill's own antialiasing. */}
                <Area
                  type="monotone"
                  dataKey="band"
                  stroke="none"
                  fill={colors.priceBand}
                  fillOpacity={1}
                  connectNulls={false}
                  animationDuration={animationMs}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bandTop"
                  stroke={colors.priceBandEdge}
                  strokeWidth={1}
                  dot={false}
                  connectNulls={false}
                  animationDuration={animationMs}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bandBottom"
                  stroke={colors.priceBandEdge}
                  strokeWidth={1}
                  dot={false}
                  connectNulls={false}
                  animationDuration={animationMs}
                  activeDot={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-1 px-1 text-[0.625rem] text-text-tertiary">
        ceny: pradcast.pl
      </figcaption>
    </figure>
  );
};

export default PriceStrip;
