import React, { useId, useMemo } from 'react';
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
import { NICE_STEPS, RangeScale } from '../../utils/scale';
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

/**
 * A coarser scale than niceScaleRange: that one wants four to seven ticks,
 * which a strip this short cannot label, so Recharts silently dropped every
 * other one — zero included (seen on live data 14.09.2026: 500 / 1500 / 2500).
 * At most three intervals above zero, zero always on a tick. Below zero only
 * when a price is: TGE does clear negative on sunny, windy weekends.
 */
export function priceScale(lo: number, hi: number): RangeScale {
  const top = Math.max(hi, 0) * 1.05;
  const bottom = Math.min(lo, 0) * 1.05;
  const step =
    NICE_STEPS.find((candidate) => Math.ceil((top - bottom) / candidate) <= 3) ??
    Math.ceil((top - bottom) / 3);
  const max = Math.max(1, Math.ceil(top / step)) * step;
  const min = Math.floor(bottom / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max; tick += step) ticks.push(tick);
  return { min, max, ticks };
}

/**
 * Shade by absolute price, zł/MWh: at or below LOW the lightest shade, at or
 * above HIGH the deepest, linear in between. Absolute rather than per day, so
 * a dear evening reads dark on every day and a cheap day never borrows the
 * deep shade for its own modest peak. The ends are where the Polish day-ahead
 * market actually lives: middays of 200–400, evening peaks of 1 200–2 500.
 */
export const PRICE_SHADE_LOW = 250;
export const PRICE_SHADE_HIGH = 1500;

/** Translucency of the forecast band's fill and of its two edges. */
const BAND_FILL_OPACITY = 0.26;
const BAND_EDGE_OPACITY = 0.7;

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The shade for one price, mixed between the two token colours. */
export function shadeAt(price: number, low: string, high: string): string {
  const a = parseHex(low);
  const b = parseHex(high);
  // A token that is not plain hex cannot be mixed; the deep end still reads.
  if (!a || !b) return high;
  const t = Math.min(1, Math.max(0, (price - PRICE_SHADE_LOW) / (PRICE_SHADE_HIGH - PRICE_SHADE_LOW)));
  const mixed = a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export interface ShadeStop {
  /** 0 at the top of the mark's own bounding box, 1 at its bottom. */
  offset: number;
  color: string;
}

/**
 * Vertical gradient stops for a mark spanning prices lo..hi. SVG maps a
 * gradient onto each mark's own bounding box, so the stops are placed where
 * the absolute anchors fall inside that span — plus both ends, mixed — and the
 * browser's linear interpolation between stops then equals `shadeAt` at every
 * height. Empty when the span is flat: a gradient over a zero-height box
 * paints nothing at all, so the caller falls back to a solid colour.
 */
export function shadeStops(lo: number, hi: number, low: string, high: string): ShadeStop[] {
  if (!(hi - lo >= 1)) return [];
  const prices = [hi, PRICE_SHADE_HIGH, PRICE_SHADE_LOW, lo].filter(
    (price, i, all) => price <= hi && price >= lo && all.indexOf(price) === i
  );
  return prices
    .sort((x, y) => y - x)
    .map((price) => ({ offset: (hi - price) / (hi - lo), color: shadeAt(price, low, high) }));
}

/** CHART_MARGIN's left/right untouched — those pin the hours under the reserve
 *  chart. Only the top shrinks: the strip has no "teraz" label and, since the
 *  unit moved into the heading, nothing else to hold room for above the plot. */
const STRIP_MARGIN = { ...CHART_MARGIN, top: 10 };

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
      ? priceScale(Math.min(...valid), Math.max(...valid))
      : priceScale(0, 1000);
  }, [rows, confirmed]);

  /*
   * One gradient per mark, because each is mapped onto that mark's own
   * bounding box — the band's fill spans lowest p10..highest p90, each edge
   * only its own percentile's range. See shadeStops. useId for the same
   * document-wide-id reason as ReserveChart's alarm gradient.
   */
  const idBase = `price-${useId().replace(/:/g, '')}`;
  const shades = useMemo(() => {
    const span = (values: Array<number | null>) => {
      const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
      return valid.length > 0 ? [Math.min(...valid), Math.max(...valid)] as const : ([0, 0] as const);
    };
    const make = (key: string, values: Array<number | null>, opacity: number) => {
      const [lo, hi] = span(values);
      const stops = shadeStops(lo, hi, colors.priceLow, colors.priceHigh);
      const id = `${idBase}-${key}`;
      return {
        id,
        stops,
        opacity,
        paint: stops.length > 0 ? `url(#${id})` : shadeAt(hi, colors.priceLow, colors.priceHigh),
      };
    };
    return {
      line: make('line', rows.map((row) => row.price), 1),
      fill: make('fill', rows.flatMap((row) => [row.bandBottom, row.bandTop]), BAND_FILL_OPACITY),
      top: make('top', rows.map((row) => row.bandTop), BAND_EDGE_OPACITY),
      bottom: make('bottom', rows.map((row) => row.bandBottom), BAND_EDGE_OPACITY),
    };
  }, [rows, colors.priceLow, colors.priceHigh, idBase]);

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
    <figure className="m-0 mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 px-1">
        {/* Unit in the heading, the way the card title reads "Rezerwa mocy (MW)" —
            a label floating over the plot looked stray (owner, 15.09.2026). */}
        <span className="whitespace-nowrap text-[0.8125rem] font-semibold text-text">
          Cena energii{' '}
          <span className="text-[0.6875rem] font-normal text-text-tertiary">(zł/MWh)</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${chipClass}`}
        >
          {chipText}
        </span>
      </div>

      {/* Height lives in App.css (.price-strip-h): short on a phone, where it is
          glanced at under the reserve chart, taller from 80rem up, where a
          6.5rem strip under a half-screen chart read flat (owner, 15.09.2026). */}
      <div className="price-strip-h mt-1" ref={ref} {...handlers}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={STRIP_MARGIN}>
            <CartesianGrid vertical={false} stroke={colors.grid} />

            <defs>
              {(confirmed ? [shades.line] : [shades.fill, shades.top, shades.bottom])
                .filter((shade) => shade.stops.length > 0)
                .map((shade) => (
                  <linearGradient key={shade.id} id={shade.id} x1="0" y1="0" x2="0" y2="1">
                    {shade.stops.map((stop) => (
                      <stop
                        key={stop.offset}
                        offset={stop.offset}
                        stopColor={stop.color}
                        stopOpacity={shade.opacity}
                      />
                    ))}
                  </linearGradient>
                ))}
            </defs>

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
              /* Every tick, always: priceScale already keeps them to four, and
                 Recharts' default collision pass dropped zero on a monitor. */
              interval={0}
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
                stroke={shades.line.paint}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                animationDuration={animationMs}
                activeDot={
                  tooltipActive === false
                    ? false
                    : { r: 4, fill: colors.priceHigh, stroke: colors.surface, strokeWidth: 2 }
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
                  fill={shades.fill.paint}
                  fillOpacity={shades.fill.stops.length > 0 ? 1 : BAND_FILL_OPACITY}
                  connectNulls={false}
                  animationDuration={animationMs}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bandTop"
                  stroke={shades.top.paint}
                  strokeOpacity={shades.top.stops.length > 0 ? 1 : BAND_EDGE_OPACITY}
                  strokeWidth={1}
                  dot={false}
                  connectNulls={false}
                  animationDuration={animationMs}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="bandBottom"
                  stroke={shades.bottom.paint}
                  strokeOpacity={shades.bottom.stops.length > 0 ? 1 : BAND_EDGE_OPACITY}
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
        ceny: pradcast.pl · intensywniej = drożej
      </figcaption>
    </figure>
  );
};

export default PriceStrip;
