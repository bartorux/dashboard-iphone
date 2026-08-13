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
  ReferenceLine,
} from 'recharts';
import { PSEDataPoint } from '../types';
import { niceScaleRange } from '../utils/scale';
import { useChartColors } from '../hooks/useChartColors';
import {
  useChartAnimationMs,
  AXIS_FONT_SIZE,
  LABEL_FONT_SIZE,
  AreaSwatch,
  CHART_BOX,
  CHART_MARGIN,
  ChartLegend,
  ChartTooltipBox,
  LineSwatch,
  TooltipRow,
  axisWidthFor,
  formatMW,
  hourTicks,
  shortHour,
  useDismissibleTooltip,
} from './chart/shared';

interface GenerationChartProps {
  data: PSEDataPoint[];
  currentHourLabel: string | null;
}

interface Row {
  key: string;
  endLabel: string;
  demand: number | null;
  pv: number | null;
  wind: number | null;
  outages: number | null;
  exchange: number | null;
  /** Everything the system generates, renewables included. */
  generation: number | null;
  /** Conventional and everything else, i.e. generation minus PV and wind. */
  other: number | null;
  /**
   * The unclamped remainder. Negative in 4 hours out of 792 measured, where the
   * PV forecast exceeds total generation — kept so the tooltip can admit it
   * instead of the stack quietly swallowing the discrepancy.
   */
  otherRaw: number | null;
}

/** Splits total generation into the part that is not PV or wind. */
function remainder(
  generation: number | null,
  pv: number | null,
  wind: number | null
): { other: number | null; otherRaw: number | null } {
  if (generation === null || pv === null || wind === null) {
    return { other: null, otherRaw: null };
  }
  const raw = generation - pv - wind;
  return { other: Math.max(0, raw), otherRaw: raw };
}

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: Row }>;
}

const GenerationTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  if (row.demand === null) {
    return (
      <ChartTooltipBox>
        <div className="font-semibold text-text">{String(label)}</div>
        <div className="text-text-tertiary">Brak danych</div>
      </ChartTooltipBox>
    );
  }

  const pv = row.pv ?? 0;
  const wind = row.wind ?? 0;
  const generation = row.generation;
  const share = generation && generation > 0 ? ((pv + wind) / generation) * 100 : 0;
  const exchange = row.exchange ?? 0;
  // Negative in the rare hours where the PV forecast exceeds total generation
  const inconsistent = row.otherRaw !== null && row.otherRaw < 0;

  return (
    <ChartTooltipBox>
      <div className="mb-1 font-semibold text-text">
        {String(label)}&ndash;{row.endLabel}
      </div>
      <dl className="space-y-0.5">
        <TooltipRow
          label="Generacja"
          value={generation === null ? 'brak' : `${formatMW(generation)} MW`}
        />
        <TooltipRow indent label="fotowoltaika" value={`${formatMW(pv)} MW`} />
        <TooltipRow indent label="wiatr" value={`${formatMW(wind)} MW`} />
        <TooltipRow
          indent
          label="pozostałe"
          value={row.other === null ? 'brak' : `${formatMW(row.other)} MW`}
        />
        <TooltipRow label="Udział OZE" value={`${share.toFixed(0)} %`} />
        <TooltipRow
          label="Zapotrzebowanie"
          value={`${formatMW(row.demand)} MW`}
          divider
        />
        <TooltipRow
          label="Wymiana"
          value={`${exchange > 0 ? 'import ' : 'eksport '}${formatMW(
            Math.abs(exchange)
          )} MW`}
        />
        <TooltipRow label="Ubytki mocy" value={`${formatMW(row.outages ?? 0)} MW`} />
        {inconsistent && (
          <div className="mt-1 border-t border-separator pt-1 text-[0.6875rem] text-warn-text">
            Prognoza OZE przekracza generację łączną o{' '}
            {formatMW(Math.abs(row.otherRaw!))} MW — tak podaje PSE.
          </div>
        )}
      </dl>
    </ChartTooltipBox>
  );
};

/**
 * Why the margin moves. Measured over 33 days, alarm hours carry +4366 MW of
 * demand and −4153 MW of PV output against calm hours, and 73 of 92 fall
 * between 17:00 and 23:00 — the evening peak meeting the end of daylight.
 *
 * Outages are deliberately not plotted: they differ by only −110 MW between
 * alarm and calm hours, so drawing them would add a line that explains nothing.
 * They stay in the tooltip.
 */
const GenerationChart: React.FC<GenerationChartProps> = ({
  data,
  currentHourLabel,
}) => {
  const animationMs = useChartAnimationMs();

  const colors = useChartColors();
  const { ref, handlers, tooltipActive } = useDismissibleTooltip();

  const rows = useMemo<Row[]>(
    () =>
      data.map((point) => ({
        key: point.hourLabel,
        endLabel: point.endLabel,
        demand: point.demand,
        pv: point.pv,
        wind: point.wind,
        outages: point.outages,
        exchange: point.exchange,
        generation: point.generation,
        ...remainder(point.generation, point.pv, point.wind),
      })),
    [data]
  );

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [
      row.demand,
      row.generation,
      // Exchange goes negative when Poland exports. A domain anchored at zero
      // clipped those hours away entirely, leaving the line flat against the
      // axis exactly when it carried the most information.
      row.exchange,
    ]);
    const valid = values.filter(
      (v): v is number => v !== null && Number.isFinite(v)
    );
    return niceScaleRange(
      valid.length > 0 ? Math.min(...valid) : NaN,
      valid.length > 0 ? Math.max(...valid) : NaN
    );
  }, [rows]);

  const ticks = useMemo(() => hourTicks(rows.map((row) => row.key)), [rows]);

  if (rows.every((row) => row.demand === null)) {
    return (
      <div className={`${CHART_BOX} grid place-items-center text-[0.8125rem] text-text-tertiary`}>
        Brak danych o generacji
      </div>
    );
  }

  return (
    <>
      <ChartLegend
        items={[
          {
            label: 'Zapotrzebowanie',
            swatch: <LineSwatch color={colors.demand} />,
          },
          {
            label: 'Fotowoltaika',
            swatch: <AreaSwatch fill={colors.pv} border={colors.pv} />,
          },
          {
            label: 'Wiatr',
            swatch: <AreaSwatch fill={colors.wind} border={colors.wind} />,
          },
          {
            label: 'Pozostałe',
            swatch: <AreaSwatch fill={colors.other} border={colors.other} />,
          },
          {
            label: 'Wymiana',
            swatch: <LineSwatch color={colors.exchange} dashed />,
          },
        ]}
      />

      <div className={CHART_BOX} ref={ref} {...handlers}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid
              vertical={false}
              stroke={colors.grid}
              strokeDasharray="3 3"
            />

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
              tickFormatter={formatMW}
              tickLine={false}
              axisLine={false}
              width={axisWidthFor(scale.ticks)}
            />

            {/* The mix, stacked: the height of the stack is total generation
                and each band is one fraction of it. `other` is clamped at zero
                for the 0.5% of hours where the PV forecast exceeds generation;
                the tooltip says so rather than letting the stack absorb it. */}
            <Area
              type="monotone"
              dataKey="pv"
              stackId="mix"
              stroke="none"
              fill={colors.pv}
              fillOpacity={0.55}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="wind"
              stackId="mix"
              stroke="none"
              fill={colors.wind}
              fillOpacity={0.55}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="other"
              stackId="mix"
              stroke="none"
              fill={colors.other}
              fillOpacity={0.55}
              animationDuration={animationMs}
              activeDot={false}
              connectNulls={false}
            />

            <Tooltip
              active={tooltipActive}
              content={<GenerationTooltip />}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {/* Crossing this line means the system flipped from exporting to
                importing — a signal in its own right. */}
            <ReferenceLine y={0} stroke={colors.axis} strokeOpacity={0.5} />

            {currentHourLabel && (
              <ReferenceLine
                x={currentHourLabel}
                stroke={colors.accent}
                strokeWidth={1.5}
                label={{
                  value: 'teraz',
                  position: 'top',
                  fontSize: LABEL_FONT_SIZE,
                  fill: colors.accent,
                }}
              />
            )}

            <Line
              type="monotone"
              dataKey="exchange"
              stroke={colors.exchange}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              activeDot={false}
            />

            <Line
              type="monotone"
              dataKey="demand"
              stroke={colors.demand}
              strokeWidth={2.75}
              dot={false}
              connectNulls={false}
              animationDuration={animationMs}
              /* Cleared with the tooltip: `active={false}` hides the box but
                 the dot is series state, so it lingered and pointed at an hour
                 the user had already dismissed. */
              activeDot={
                tooltipActive === false
                  ? false
                  : {
                      r: 4,
                      fill: colors.demand,
                      stroke: colors.surface,
                      strokeWidth: 2,
                    }
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default GenerationChart;
