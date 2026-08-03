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
import { marginDistribution, standingFor } from '../utils/history';
import { useChartColors } from '../hooks/useChartColors';
import { HistoryState } from '../hooks/useHistory';
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
} from './chart/shared';

interface HistoryChartProps {
  dayData: PSEDataPoint[];
  history: PSEDataPoint[];
  state: HistoryState;
  days: number;
  onRetry: () => void;
}

interface Row {
  key: string;
  band: [number, number] | null;
  median: number | null;
  today: number | null;
  samples: number;
}

const STANDING_LABEL = {
  below: 'nietypowo nisko',
  typical: 'w normie',
  above: 'nietypowo wysoko',
  unknown: 'brak porównania',
} as const;

const STANDING_TONE = {
  below: 'text-alarm-text',
  typical: 'text-text-secondary',
  above: 'text-ok-text',
  unknown: 'text-text-tertiary',
} as const;

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: Row }>;
}

const HistoryTooltip: React.FC<TooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  const standing = standingFor(
    row.today,
    row.band
      ? {
          hourLabel: row.key,
          p10: row.band[0],
          p50: row.median ?? 0,
          p90: row.band[1],
          samples: row.samples,
        }
      : undefined
  );

  return (
    <ChartTooltipBox>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-text">{String(label)}</span>
        <span className={`text-[11px] font-semibold ${STANDING_TONE[standing]}`}>
          {STANDING_LABEL[standing]}
        </span>
      </div>
      <dl className="space-y-0.5">
        <TooltipRow
          label="Dziś"
          value={row.today === null ? 'brak' : `${formatMW(row.today)} MW`}
        />
        <TooltipRow
          label="Mediana"
          value={row.median === null ? 'brak' : `${formatMW(row.median)} MW`}
        />
        <TooltipRow
          label="Typowy zakres"
          value={
            row.band
              ? `${formatMW(row.band[0])} … ${formatMW(row.band[1])} MW`
              : 'brak'
          }
          divider
        />
      </dl>
    </ChartTooltipBox>
  );
};

/**
 * Today's margin against the spread of the same hour on past days. Answers the
 * question a single day's curve cannot: is this evening unusual, or is it simply
 * what evenings look like?
 */
const HistoryChart: React.FC<HistoryChartProps> = ({
  dayData,
  history,
  state,
  days,
  onRetry,
}) => {
  const colors = useChartColors();

  const distribution = useMemo(() => marginDistribution(history), [history]);

  const rows = useMemo<Row[]>(() => {
    const todayByHour = new Map<string, number>();
    for (const point of dayData) {
      if (point.reserve === null || point.required === null) continue;
      todayByHour.set(point.hourLabel, point.reserve - point.required);
    }

    // Driven by the historical hours, so a day with no data still shows the band
    return distribution.map((hour) => ({
      key: hour.hourLabel,
      band: [hour.p10, hour.p90] as [number, number],
      median: hour.p50,
      today: todayByHour.get(hour.hourLabel) ?? null,
      samples: hour.samples,
    }));
  }, [distribution, dayData]);

  const scale = useMemo(() => {
    const values = rows.flatMap((row) => [
      row.band?.[0] ?? null,
      row.band?.[1] ?? null,
      row.today,
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

  if (state === 'loading' || state === 'idle') {
    return (
      <div className={CHART_BOX}>
        <div className="h-full animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (state === 'error' || rows.length === 0) {
    return (
      <div className={`${CHART_BOX} grid place-items-center`}>
        <div className="text-center">
          <p className="text-[13px] text-text-tertiary">
            Nie udało się pobrać historii
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-9 rounded-lg px-3 text-[13px] font-medium text-accent-text"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChartLegend
        items={[
          { label: 'Dziś', swatch: <LineSwatch color={colors.reserve} /> },
          { label: 'Mediana', swatch: <LineSwatch color={colors.history} dashed /> },
          {
            label: `Typowy zakres (${days} dni)`,
            swatch: (
              <AreaSwatch fill={colors.bandHistory} border={colors.history} />
            ),
          },
        ]}
      />

      <div className={CHART_BOX}>
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

            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill={colors.bandHistory}
              fillOpacity={1}
              animationDuration={ANIMATION_MS}
              activeDot={false}
              connectNulls={false}
            />

            <Tooltip
              content={<HistoryTooltip />}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />

            {/* Below this line the reserve fails to cover what is required */}
            <ReferenceLine
              y={0}
              stroke={colors.alarm}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
            />

            <Line
              type="monotone"
              dataKey="median"
              stroke={colors.history}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
              activeDot={false}
            />

            <Line
              type="monotone"
              dataKey="today"
              stroke={colors.reserve}
              strokeWidth={2.75}
              dot={false}
              connectNulls={false}
              animationDuration={ANIMATION_MS}
              activeDot={{
                r: 4,
                fill: colors.reserve,
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

export default HistoryChart;
