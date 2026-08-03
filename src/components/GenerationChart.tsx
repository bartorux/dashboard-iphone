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
  ANIMATION_MS,
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
  /** PV + wind, drawn as the share of that total which is renewable. */
  renewables: number | null;
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

  const renewables = row.renewables ?? 0;
  const generation = row.generation;
  const conventional = generation === null ? null : generation - renewables;
  const share = generation && generation > 0 ? (renewables / generation) * 100 : 0;

  return (
    <ChartTooltipBox>
      <div className="mb-1 font-semibold text-text">
        {String(label)}&ndash;{row.endLabel}
      </div>
      <dl className="space-y-0.5">
        <TooltipRow label="Zapotrzebowanie" value={`${formatMW(row.demand)} MW`} />
        <TooltipRow
          label="Generacja"
          value={generation === null ? 'brak' : `${formatMW(generation)} MW`}
        />
        <TooltipRow label="  fotowoltaika" value={`${formatMW(row.pv ?? 0)} MW`} />
        <TooltipRow label="  wiatr" value={`${formatMW(row.wind ?? 0)} MW`} />
        <TooltipRow
          label="  pozostałe źródła"
          value={
            conventional === null
              ? 'brak'
              : `${formatMW(conventional)} MW`
          }
        />
        <TooltipRow
          label="Wymiana"
          value={`${(row.exchange ?? 0) > 0 ? 'import ' : 'eksport '}${formatMW(
            Math.abs(row.exchange ?? 0)
          )} MW`}
        />
        <TooltipRow
          label="Ubytki mocy"
          value={`${formatMW(row.outages ?? 0)} MW`}
        />
        <TooltipRow
          label="Udział OZE"
          value={`${share.toFixed(0)} %`}
          divider
        />
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
        renewables:
          point.pv === null || point.wind === null ? null : point.pv + point.wind,
      })),
    [data]
  );

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [
      row.demand,
      row.generation,
      row.renewables,
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
      <div className={`${CHART_BOX} grid place-items-center text-[13px] text-text-tertiary`}>
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
            label: 'Generacja łącznie',
            swatch: <LineSwatch color={colors.wind} />,
          },
          {
            label: 'w tym OZE',
            swatch: <AreaSwatch fill={colors.pv} border={colors.pv} />,
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
              tick={{ fontSize: 11, fill: colors.axis }}
              tickLine={false}
              axisLine={{ stroke: colors.grid }}
              tickMargin={8}
            />

            <YAxis
              domain={[scale.min, scale.max]}
              ticks={scale.ticks}
              tick={{ fontSize: 11, fill: colors.axis }}
              tickFormatter={formatMW}
              tickLine={false}
              axisLine={false}
              width={axisWidthFor(scale.ticks)}
            />

            {/* Renewables as a share of total generation. Deliberately NOT
                stacked with a "conventional" band: the PV forecast exceeds total
                generation in 4 hours out of 792, which would make that band
                negative. Clamping it would hide a real inconsistency, so the
                gap between this area and the generation line carries it
                instead — and stays visible when the forecast disagrees. */}
            <Area
              type="monotone"
              dataKey="renewables"
              stroke="none"
              fill={colors.pv}
              fillOpacity={0.4}
              animationDuration={ANIMATION_MS}
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
                  fontSize: 10,
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
              animationDuration={ANIMATION_MS}
              activeDot={false}
            />

            <Line
              type="monotone"
              dataKey="generation"
              stroke={colors.wind}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
              activeDot={false}
            />

            <Line
              type="monotone"
              dataKey="demand"
              stroke={colors.demand}
              strokeWidth={2.75}
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
              activeDot={{
                r: 4,
                fill: colors.demand,
                stroke: colors.surface,
                strokeWidth: 2,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default GenerationChart;
